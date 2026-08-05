import { NextResponse } from "next/server";
import { getSyncedMonsters, setSyncedMonsters } from "../../../../lib/monsters";

// Chiamata da cron-job.org (stesso meccanismo usato per SW Auto Redeemer):
// GET /api/monsters/sync?secret=CRON_SECRET
//
// Riscritta il 02/08/2026 dopo aver verificato l'API vera di swarfarm alla
// mano (grazie a Flora):
// - "/api/v2/monsters/" (quello usato da questo file fino a stanotte) non
//   compare nella Api Root ufficiale — l'endpoint vero è "/api/bestiary".
// - "/api/bestiary" (lista) NON ha il campo accuracy, solo la pagina di
//   DETTAGLIO di ogni singolo mostro ce l'ha.
// - Le seconde awakening NON si riconoscono in modo affidabile da "stesso
//   nome+elemento, ID diverso" (falsi positivi su Abellio/Bayek). L'UNICO
//   segnale vero è "awakens_from" nella pagina di dettaglio, che per una
//   vera 2A punta al proprio stesso nome.
//
// STORIA DEL 05/08/2026 (Flora — IMPORTANTE, leggere prima di toccare
// questo file di nuovo): ho provato DUE volte a rendere "intelligente" la
// scelta di chi tiene il nome pulito quando un nome+elemento compare più
// volte (prima con l'ID più basso che vince sempre, poi con un controllo
// "obtainable" rifatto su tutti i membri di ogni gruppo ambiguo). Entrambe
// le volte ho rotto DECINE di mostri normalissimi che non c'entravano
// niente — la seconda volta perché il controllo extra raddoppiava le
// chiamate verso swarfarm e sotto il carico fallivano a raffica, facendo
// perdere il nome pulito a roba a caso ogni volta che una richiesta
// falliva. LEZIONE: qualsiasi logica che dipende dalla RETE per decidere
// se un mostro tiene il suo nome pulito è troppo fragile per girare su
// centinaia di mostri ogni sync — un fallimento di rete isolato non deve
// mai poter degradare un nome che prima funzionava.
// Quindi: si torna alla regola originale, stabile da mesi, zero sorprese
// (il primo/più basso ID di un gruppo tiene il nome pulito, gli altri si
// controllano per la 2A vera) — E gli UNICI casi eccezionali si scrivono
// a mano, uno alla volta, SOLO dopo averli verificati con
// /api/admin/monsters/lookup come abbiamo fatto per Tesarion. Mai più un
// meccanismo automatico che decide da solo su tutto il bestiario.
const SWARFARM_BASE = "https://swarfarm.com";
const ICON_BASE = "https://swarfarm.com/static/herders/images/monsters/";

// Eccezioni scritte a mano, verificate una per una con il tool di lookup
// prima di essere aggiunte qui — MAI un'ipotesi. com2us_id che non deve
// MAI tenere il nome pulito del suo gruppo, anche se ha l'ID più basso.
//   17112 -> "Tesarion" vecchio/ritirato (obtainable:false, verificato
//   05/08/2026): il vero Fire Ifrit risvegliato è 19212.
const NEVER_CLEAN_NAME_IDS = new Set([17112]);

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

// Verifica VERA (non un indovinello) se un mostro è una seconda awakening:
// la sua pagina di dettaglio ha "awakens_from" che punta al proprio stesso
// nome (risveglia da se stesso già risvegliato una volta), non a un nome
// diverso (che sarebbe la normale prima awakening, che risveglia dalla
// forma base non awakened).
async function isConfirmedSecondAwakening(pk, ownName) {
  try {
    const res = await fetch(`${SWARFARM_BASE}/api/bestiary/${pk}?format=json`, { headers: { Accept: "application/json" } });
    if (!res.ok) return false;
    const data = await res.json();
    const fromName = data?.awakens_from?.name;
    return !!fromName && fromName.trim().toLowerCase() === ownName.trim().toLowerCase();
  } catch {
    return false;
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

  // Prima passata: separo subito i "sicuri" (una sola variante per
  // nome+elemento, o il primo/più-basso ID di ogni gruppo — quello resta
  // sempre col nome semplice, SALVO l'eccezione scritta a mano sopra) dai
  // "candidati da verificare" (ogni ID extra oltre al primo, per cui serve
  // la chiamata di dettaglio). Le verifiche si fanno poi TUTTE INSIEME a
  // lotti paralleli, non una alla volta.
  const safeEntries = [];
  const candidates = []; // { name, elementPrefix, extra, isCollab }
  for (const [name, variants] of byBareName) {
    const uniqueElements = new Set(variants.map((v) => v.element));
    for (const element of uniqueElements) {
      const sameElement = variants.filter((v) => v.element === element);
      const sorted = [...sameElement].sort((a, b) => a.com2usId - b.com2usId);
      const elementPrefix = uniqueElements.size > 1 ? element : null;
      const displayName = elementPrefix ? `${elementPrefix} ${name}` : name;
      // Il primo/più basso ID tiene il nome pulito, a meno che non sia
      // nella lista di esclusione scritta a mano: in quel caso si passa
      // al successivo (che se non è a sua volta escluso, vince lui).
      const baseIndex = sorted.findIndex((v) => !NEVER_CLEAN_NAME_IDS.has(v.com2usId));
      const base = baseIndex === -1 ? sorted[0] : sorted[baseIndex];
      safeEntries.push({ name: displayName, iconUrl: base.iconUrl, com2usId: base.com2usId, baseAccuracy: oldByComId.get(base.com2usId) ?? null });
      for (let i = 0; i < sorted.length; i++) {
        if (i === baseIndex || (baseIndex === -1 && i === 0)) continue;
        candidates.push({ displayName, bareName: name, extra: sorted[i] });
      }
    }
  }

  // Verifica a lotti paralleli (10 alla volta): abbastanza per essere
  // veloci, non tanti da rischiare i rate limit di swarfarm.
  const confirmed = [];
  const BATCH = 10;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((c) => isConfirmedSecondAwakening(c.extra.pk, c.bareName)));
    batch.forEach((c, j) => { if (results[j]) confirmed.push(c); });
  }
  const confirmedIds = new Set(confirmed.map((c) => c.extra.com2usId));

  const finalList = [...safeEntries];
  for (const c of candidates) {
    // Confermata seconda awakening -> "Nome 2A". NON confermata (perché è
    // davvero qualcos'altro, O perché la verifica è fallita per un motivo
    // di rete) -> si tiene COMUNQUE, mai scartata, solo disambiguata con il
    // proprio ID. Scartare i non confermati faceva sparire mostri VERI dal
    // sito ogni volta che due entry condividevano nome+elemento per un
    // motivo diverso dalla seconda awakening (es. Abellio/Bayek).
    const isConfirmed = confirmedIds.has(c.extra.com2usId);
    finalList.push({
      name: isConfirmed ? `${c.displayName} 2A` : `${c.displayName} (ID ${c.extra.com2usId})`,
      iconUrl: c.extra.iconUrl,
      com2usId: c.extra.com2usId,
      baseAccuracy: oldByComId.get(c.extra.com2usId) ?? null,
    });
  }

  await setSyncedMonsters(finalList);
  return { count: finalList.length, secondAwakeningsFound: confirmed.length, candidatesChecked: candidates.length };
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
