import { NextResponse } from "next/server";
import { getSyncedMonsters, setSyncedMonsters } from "../../../../lib/monsters";

// Chiamata da cron-job.org (stesso meccanismo usato per SW Auto Redeemer):
// GET /api/monsters/sync?secret=CRON_SECRET
//
// Riscritta il 02/08/2026 dopo aver verificato l'API vera di swarfarm alla
// mano (grazie a Flora):
// - "/api/v2/monsters/" (quello usato da questo file fino a stanotte) non
//   compare nella Api Root ufficiale (swarfarm.com/api/?format=api elenca
//   solo bestiary, skill, skill_effect, leader_skill, source) — molto
//   probabilmente non è mai esistito davvero, un errore mio fin
//   dall'inizio. L'endpoint vero è "/api/bestiary".
// - "/api/bestiary" (lista) NON ha il campo accuracy, solo la pagina di
//   DETTAGLIO di ogni singolo mostro ce l'ha — vedi gestione sotto.
//
// STRUTTURA MOSTRI IN SW (confermata da Flora il 05/08/2026, tenerla a
// mente per non confondere mai più i casi):
//   - Ogni famiglia ha una forma BASE + una PRIMA awakening (nome diverso,
//     es. Ifrit -> Tesarion). Nomi diversi -> non generano MAI collisione
//     nel nostro raggruppamento per nome, nessun problema.
//   - Una lista ristretta di famiglie ha ANCHE una SECONDA awakening, che
//     mantiene lo STESSO nome della prima (es. Eshir 1a e Eshir 2A) — è
//     l'UNICO caso "normale" di stesso-nome-stesso-elemento con più ID.
//     Famiglie note con vera 2A (lista di Flora, forma base): Inugami,
//     Griffon, Warbear, High Elemental, Fairy, Pixie, Harpu, Werewolf,
//     Martial Cat, Living Armor, Frankenstein, Howl, Grim Reaper,
//     Vagabond, Mystic Witch, Inferno, Hellhound.
//   - I collab sono SEMPRE già risvegliati, gestiti a parte con la coppia
//     collab<->normale (tool manuale in Admin, non tocca questo sync).
//   - Quindi: se un nome+elemento compare più di una volta SENZA che
//     nessuna delle occorrenze sia una vera 2A confermata, non è uno dei
//     casi sopra — è un errore/duplicato nei dati di swarfarm (visto con
//     Abellio/Bayek, e con "Tesarion": com2us_id 17112 è una versione
//     VECCHIA RITIRATA — "obtainable": false — di un personaggio diverso
//     dal Tesarion vero, 19212).
//
// Il segnale vero per la 2A è "awakens_from" sulla pagina di dettaglio:
// punta al proprio stesso nome. NON si indovina da "stesso nome, ID
// diverso" (dava falsi positivi su Abellio/Bayek).
//
// PRESTAZIONI/AFFIDABILITÀ (bug corretto il 05/08/2026, Flora — importante):
// la chiamata di dettaglio va fatta SOLO dove serve davvero. Farla per
// OGNI membro di OGNI gruppo con nome doppio (anche quelli con una 2A
// normalissima, che sono centinaia) ha sovraccaricato swarfarm e fatto
// fallire richieste a caso sotto il carico — risultato: mostri normalissimi
// hanno perso il nome pulito senza nessun motivo reale, solo perché la
// LORO chiamata di rete è fallita per throttling. Quindi:
//   Fase 1 (comportamento originale, affidabile da mesi): il primo/più
//     basso ID di ogni gruppo tiene il nome pulito SUBITO, senza nessuna
//     chiamata di rete per lui. Solo gli "extra" (dal secondo in poi)
//     vengono controllati per la 2A vera.
//   Fase 2 (nuova, ma attivata SOLO nei pochissimi gruppi ambigui — zero
//     2A confermate tra gli extra, quindi non è un caso normale): si
//     rifà il controllo su TUTTO il gruppo, stavolta guardando anche
//     "obtainable", per scegliere chi tiene il nome pulito tra versioni
//     vecchie/ritirate e quella vera. Pochissimi gruppi, pochissime
//     chiamate in più, nessun rischio per tutto il resto del bestiario.
const SWARFARM_BASE = "https://swarfarm.com";
const ICON_BASE = "https://swarfarm.com/static/herders/images/monsters/";
const BATCH = 10; // chiamate di dettaglio parallele per volta — veloce ma senza rischiare i rate limit di swarfarm

function parseRaw(raw) {
  const name = raw.name;
  const element = raw.element;
  const imageFilename = raw.image_filename;
  const com2usId = raw.com2us_id;
  const pk = raw.pk;
  if (!name || !imageFilename || !pk) return null;
  // Alcuni elementi del bestiario sono materiali di fusione (es. "Living
  // Armor") senza nome localizzato in inglese: swarfarm restituisce il nome
  // in coreano. Non sono mostri giocabili in una Difesa/Counter, li scartiamo.
  if (/[\u3131-\uD79D\u4E00-\u9FFF]/.test(name)) return null;

  return { name, element, iconUrl: `${ICON_BASE}${imageFilename}`, com2usId, pk };
}

// Chiamata di dettaglio vera per un singolo pk: se è confermata seconda
// awakening di se stesso ("awakens_from" punta al proprio stesso nome) e
// se è "obtainable" (serve solo in Fase 2, per i gruppi ambigui).
async function fetchMonsterDetail(pk, ownName) {
  try {
    const res = await fetch(`${SWARFARM_BASE}/api/bestiary/${pk}?format=json`, { headers: { Accept: "application/json" } });
    if (!res.ok) return { confirmed2A: false, obtainable: null };
    const data = await res.json();
    const fromName = data?.awakens_from?.name;
    const confirmed2A = !!fromName && fromName.trim().toLowerCase() === ownName.trim().toLowerCase();
    return { confirmed2A, obtainable: typeof data?.obtainable === "boolean" ? data.obtainable : null };
  } catch {
    return { confirmed2A: false, obtainable: null };
  }
}

async function fetchDetailsBatched(items, pkOf, nameOf) {
  const out = new Array(items.length);
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((it) => fetchMonsterDetail(pkOf(it), nameOf(it))));
    results.forEach((r, j) => { out[i + j] = r; });
  }
  return out;
}

// Logica vera della sincronizzazione, separata dalla route: la usano sia il
// link con il segreto (per il cron) sia il pulsante in Diagnostica, così
// non esistono due copie della stessa cosa che possono divergere.
export async function syncMonstersFromSwarfarm() {
  const res = await fetch(`${SWARFARM_BASE}/api/bestiary?format=json`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`swarfarm risposta ${res.status}`);
  const items = await res.json(); // niente paginazione su questo endpoint: tutto in un colpo solo
  const raws = (Array.isArray(items) ? items : []).map(parseRaw).filter(Boolean);

  // L'accuracy base non è nella lista, solo nel dettaglio di ogni mostro —
  // richiederebbe migliaia di chiamate per tutti. Nel dubbio si preserva
  // quella già salvata da una sincronizzazione precedente, invece di
  // perderla o inventarla: si aggiorna sempre nome/icona/ID (quelli sì
  // affidabili dalla lista), l'accuracy resta quella vecchia se già nota.
  const oldByComId = new Map();
  for (const m of await getSyncedMonsters()) {
    if (m.com2usId != null && m.baseAccuracy != null) oldByComId.set(m.com2usId, m.baseAccuracy);
  }

  const byBareName = new Map();
  for (const m of raws) {
    if (!byBareName.has(m.name)) byBareName.set(m.name, []);
    byBareName.get(m.name).push(m);
  }

  const safeEntries = [];
  const candidates = []; // { displayName, bareName, extra, groupKey } — dal 2° membro in poi di ogni gruppo
  const baseByGroupKey = new Map(); // groupKey -> { displayName, base }
  for (const [name, variants] of byBareName) {
    const uniqueElements = new Set(variants.map((v) => v.element));
    for (const element of uniqueElements) {
      const sameElement = variants.filter((v) => v.element === element);
      const sorted = [...sameElement].sort((a, b) => a.com2usId - b.com2usId);
      const elementPrefix = uniqueElements.size > 1 ? element : null;
      const displayName = elementPrefix ? `${elementPrefix} ${name}` : name;
      const base = sorted[0];
      if (sorted.length === 1) {
        safeEntries.push({ name: displayName, iconUrl: base.iconUrl, com2usId: base.com2usId, baseAccuracy: oldByComId.get(base.com2usId) ?? null });
        continue;
      }
      const groupKey = `${name}|${element}`;
      baseByGroupKey.set(groupKey, { displayName, base });
      for (let i = 1; i < sorted.length; i++) {
        candidates.push({ displayName, bareName: name, extra: sorted[i], groupKey });
      }
    }
  }

  // Fase 1: controllo 2A solo sugli extra (comportamento originale).
  const details1 = await fetchDetailsBatched(candidates, (c) => c.extra.pk, (c) => c.bareName);
  candidates.forEach((c, i) => { c.detail = details1[i]; });
  const groupsWithConfirmed2A = new Set(candidates.filter((c) => c.detail.confirmed2A).map((c) => c.groupKey));

  // Fase 2, SOLO per i gruppi senza nessuna 2A confermata (ambigui per
  // davvero, tipo Tesarion): si riguarda tutto il gruppo con "obtainable".
  const ambiguousGroupKeys = [...baseByGroupKey.keys()].filter((k) => !groupsWithConfirmed2A.has(k));
  const ambiguousMembers = []; // { groupKey, com2usId, pk, isBase }
  for (const groupKey of ambiguousGroupKeys) {
    const { base } = baseByGroupKey.get(groupKey);
    ambiguousMembers.push({ groupKey, com2usId: base.com2usId, pk: base.pk, isBase: true });
    for (const c of candidates.filter((c) => c.groupKey === groupKey)) {
      ambiguousMembers.push({ groupKey, com2usId: c.extra.com2usId, pk: c.extra.pk, isBase: false });
    }
  }
  const bareNameByGroupKey = new Map([...baseByGroupKey.keys()].map((k) => [k, k.split("|")[0]]));
  const details2 = await fetchDetailsBatched(ambiguousMembers, (m) => m.pk, (m) => bareNameByGroupKey.get(m.groupKey));
  ambiguousMembers.forEach((m, i) => { m.detail = details2[i]; });

  const winnerComIdForAmbiguous = new Map(); // groupKey -> com2usId vincitore, o null
  for (const groupKey of ambiguousGroupKeys) {
    const members = ambiguousMembers.filter((m) => m.groupKey === groupKey);
    const obtainableOnes = members.filter((m) => m.detail?.obtainable === true);
    winnerComIdForAmbiguous.set(groupKey, obtainableOnes.length === 1 ? obtainableOnes[0].com2usId : null);
  }

  // Assemblaggio finale.
  for (const [groupKey, { displayName, base }] of baseByGroupKey) {
    if (groupsWithConfirmed2A.has(groupKey)) {
      // Caso normale: base + 2A vera. Il nome pulito va SEMPRE alla base,
      // esattamente come da mesi — zero dipendenza da "obtainable" qui.
      safeEntries.push({ name: displayName, iconUrl: base.iconUrl, com2usId: base.com2usId, baseAccuracy: oldByComId.get(base.com2usId) ?? null });
    } else {
      // Caso ambiguo: nome pulito solo a chi "obtainable" indica come
      // l'unico vero, altrimenti disambiguato come tutti gli altri.
      const winner = winnerComIdForAmbiguous.get(groupKey);
      const keepClean = winner === base.com2usId;
      safeEntries.push({
        name: keepClean ? displayName : `${displayName} (ID ${base.com2usId})`,
        iconUrl: base.iconUrl,
        com2usId: base.com2usId,
        baseAccuracy: oldByComId.get(base.com2usId) ?? null,
      });
    }
  }

  let secondAwakeningsFound = 0;
  for (const c of candidates) {
    let label;
    if (c.detail.confirmed2A) {
      label = `${c.displayName} 2A`;
      secondAwakeningsFound++;
    } else if (!groupsWithConfirmed2A.has(c.groupKey) && winnerComIdForAmbiguous.get(c.groupKey) === c.extra.com2usId) {
      // Gruppo ambiguo e QUESTO extra è risultato l'unico "obtainable" —
      // tiene lui il nome pulito, non la base.
      label = c.displayName;
    } else {
      label = `${c.displayName} (ID ${c.extra.com2usId})`;
    }
    safeEntries.push({
      name: label,
      iconUrl: c.extra.iconUrl,
      com2usId: c.extra.com2usId,
      baseAccuracy: oldByComId.get(c.extra.com2usId) ?? null,
    });
  }

  // Avviso informativo (non blocca né cambia nulla): se una 2A viene
  // confermata su un nome che non è nella lista nota di famiglie con
  // vera seconda awakening, segnala — può voler dire che il controllo ha
  // dato un falso positivo su un nome nuovo mai visto prima.
  const KNOWN_2A_FAMILIES = new Set([
    "inugami", "griffon", "warbear", "high elemental", "fairy", "pixie", "harpu",
    "werewolf", "martial cat", "living armor", "frankenstein", "howl", "grim reaper",
    "vagabond", "mystic witch", "inferno", "hellhound",
  ]);
  const unexpected2ANames = [...groupsWithConfirmed2A]
    .map((k) => k.split("|")[0])
    .filter((n) => !KNOWN_2A_FAMILIES.has(n.trim().toLowerCase()));

  const finalList = safeEntries;
  await setSyncedMonsters(finalList);
  return {
    count: finalList.length,
    secondAwakeningsFound,
    candidatesChecked: candidates.length,
    unexpected2ANames: [...new Set(unexpected2ANames)],
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncMonstersFromSwarfarm();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
