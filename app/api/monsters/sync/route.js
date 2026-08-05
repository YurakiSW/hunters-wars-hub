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
// - Le seconde awakening NON si riconoscono in modo affidabile da "stesso
//   nome+elemento, ID diverso": verificato da Flora che questo criterio
//   dava falsi positivi su Abellio e Bayek (nessuna seconda awakening).
//   L'UNICO segnale vero è il campo "awakens_from" della pagina di
//   dettaglio: per una seconda awakening punta al proprio stesso nome
//   (confermato su Eshir). Per ogni coppia stesso-nome-stesso-elemento
//   trovata (un numero contenuto, decine non migliaia) si fa la chiamata
//   di dettaglio in più per controllarlo DAVVERO, invece di indovinare.
const SWARFARM_BASE = "https://swarfarm.com";
const ICON_BASE = "https://swarfarm.com/static/herders/images/monsters/";

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

// Chiamata di dettaglio VERA (non un indovinello) per un singolo pk:
// restituisce se è confermata seconda awakening di se stesso
// ("awakens_from" punta al proprio stesso nome) e se è "obtainable" —
// campo aggiunto il 05/08/2026 (Flora, "Tesarion"): quando due mostri
// diversi condividono nome+elemento non per un errore di database ma
// perché uno è una versione VECCHIA e RITIRATA dello stesso personaggio
// (pre-rework, swarfarm la tiene comunque nello storico), "obtainable"
// distingue in modo affidabile quale delle due è quella vera oggi — molto
// meglio di indovinare dall'ID più basso/più alto, che non ha alcuna
// relazione garantita con quale versione sia quella attuale.
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

  // Prima passata: separo i "sicuri" (una sola variante per nome+elemento,
  // niente da disambiguare) dai "gruppi con più varianti" (per cui serve
  // la chiamata di dettaglio per capire chi è chi).
  // BUG CORRETTO IL 05/08/2026 (Flora): prima il primo/più-basso ID di ogni
  // gruppo teneva SEMPRE il nome pulito, dando per scontato che fosse
  // sempre quello legittimo. Falso in due modi diversi, entrambi visti
  // stavolta con "Tesarion": com2us_id 17112 e 19212 condividono nome ed
  // elemento, ma non sono un errore di database (come Abellio/Bayek) — 17112
  // è una versione VECCHIA e RITIRATA dello stesso personaggio ("obtainable":
  // false), 19212 è quella vera oggi. L'ID più basso non ha alcuna relazione
  // garantita con "quale versione è quella attuale". Ora: per ogni gruppo si
  // guarda "obtainable" su TUTTI i membri (non solo sugli extra) — chi è
  // l'unico ottenibile tiene il nome pulito. Se il gruppo non dà una risposta
  // chiara (zero o più di un ottenibile, o dati mancanti), NESSUNO tiene il
  // nome pulito: si disambiguano tutti con l'ID, mai un'ipotesi silenziosa.
  const safeEntries = [];
  const groupMembers = []; // ogni entry di un gruppo con più varianti, in attesa di dettaglio
  for (const [name, variants] of byBareName) {
    const uniqueElements = new Set(variants.map((v) => v.element));
    const isCollab = uniqueElements.size > 1 && !/homunculus/i.test(name);
    for (const element of uniqueElements) {
      const sameElement = variants.filter((v) => v.element === element);
      const elementPrefix = uniqueElements.size > 1 ? element : null;
      const displayName = elementPrefix ? `${elementPrefix} ${name}` : name;
      if (sameElement.length === 1) {
        const only = sameElement[0];
        safeEntries.push({ name: displayName, iconUrl: only.iconUrl, com2usId: only.com2usId, baseAccuracy: oldByComId.get(only.com2usId) ?? null, isCollab });
        continue;
      }
      const groupKey = `${name}|${element}`;
      for (const m of sameElement) {
        groupMembers.push({ displayName, bareName: name, member: m, isCollab, groupKey });
      }
    }
  }

  // Dettaglio a lotti paralleli (10 alla volta) per OGNI membro di un
  // gruppo con più varianti: abbastanza per essere veloci, non tanti da
  // rischiare i rate limit di swarfarm.
  const BATCH = 10;
  for (let i = 0; i < groupMembers.length; i += BATCH) {
    const batch = groupMembers.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((c) => fetchMonsterDetail(c.member.pk, c.bareName)));
    batch.forEach((c, j) => { c.detail = results[j]; });
  }

  // Un vincitore per gruppo: l'unico membro con obtainable===true. Se il
  // gruppo non ne ha esattamente uno, resta ambiguo -> nessuno tiene il
  // nome pulito.
  const byGroupKey = new Map();
  for (const c of groupMembers) {
    if (!byGroupKey.has(c.groupKey)) byGroupKey.set(c.groupKey, []);
    byGroupKey.get(c.groupKey).push(c);
  }
  const winnerComId = new Map(); // groupKey -> com2usId del vincitore, o null se ambiguo
  for (const [groupKey, members] of byGroupKey) {
    const obtainableOnes = members.filter((m) => m.detail?.obtainable === true);
    winnerComId.set(groupKey, obtainableOnes.length === 1 ? obtainableOnes[0].member.com2usId : null);
  }

  let secondAwakeningsFound = 0;
  for (const c of groupMembers) {
    const isWinner = winnerComId.get(c.groupKey) === c.member.com2usId;
    let label;
    if (isWinner) {
      label = c.displayName;
    } else if (c.detail?.confirmed2A) {
      label = `${c.displayName} 2A`;
      secondAwakeningsFound++;
    } else {
      label = `${c.displayName} (ID ${c.member.com2usId})`;
    }
    safeEntries.push({
      name: label,
      iconUrl: c.member.iconUrl,
      com2usId: c.member.com2usId,
      baseAccuracy: oldByComId.get(c.member.com2usId) ?? null,
      isCollab: c.isCollab,
    });
  }

  const finalList = safeEntries;
  await setSyncedMonsters(finalList);
  return { count: finalList.length, secondAwakeningsFound, candidatesChecked: groupMembers.length };
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
