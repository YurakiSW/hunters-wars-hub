import { redis } from "./redis";
import { normalizeMonsterName, canonicalMonsterName } from "./textUtils";
import { getCanonicalNameMap } from "./monsters";
import { listDefs } from "./defs";

const DECK_IDS_KEY = "deck:ids"; // Set di tutti gli id Deck
const deckKey = (id) => `deck:${id}`;

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Chiave di composizione: i primi 3 mostri della squadra, canonicalizzati
// (coppie collab<->normale unificate) e ordinati — libera come teamKey(),
// non ha leader fisso. Serve SOLO per raggruppare i deck che condividono
// la stessa terna (numerazione "Build N"), non è un identificativo salvato
// da nessuna parte: si ricalcola sempre al volo dal bestiario più recente.
function compositionKey(units, canonicalMap) {
  return (units || [])
    .slice(0, 3)
    .map((u) => normalizeMonsterName(canonicalMonsterName(u.name, canonicalMap)))
    .sort()
    .join("|");
}

async function attachBuildLabels(decks) {
  const canonicalMap = await getCanonicalNameMap();
  const groups = new Map();
  for (const d of decks) {
    const key = compositionKey(d.units, canonicalMap);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  for (const group of groups.values()) {
    // Ordine di CREAZIONE, fisso — mai quello di visualizzazione/riordino
    // manuale, altrimenti spostare un deck in pagina gli farebbe cambiare
    // numero sotto agli occhi.
    group.sort((a, b) => a.createdAt - b.createdAt);
    group.forEach((d, i) => { d.buildLabel = d.buildName?.trim() || `Build ${i + 1}`; });
  }
  return decks;
}

export async function listDecks() {
  const ids = await redis.smembers(DECK_IDS_KEY);
  if (!ids.length) return [];
  const raw = await redis.mget(...ids.map(deckKey));
  const decks = raw.filter(Boolean);
  // Ordine di visualizzazione: campo `order` manuale, poi per data di
  // creazione per chi non è mai stato riordinato.
  decks.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
  return attachBuildLabels(decks);
}

export async function getDeck(id) {
  const deck = await redis.get(deckKey(id));
  if (!deck) return null;
  const [withLabel] = await attachBuildLabels([deck]);
  return withLabel;
}

// Difese nemiche già battute da questa stessa composizione secondo i
// Counter approvati esistenti — presa in automatico SOLO al momento della
// creazione/copia del deck (vedi createDeckFromScratch/createDeckFromCounter).
// Da lì in poi è un dato indipendente del deck come tutto il resto: questa
// funzione non viene più richiamata dopo la creazione.
export async function findAutoAgainstDefs(units) {
  const canonicalMap = await getCanonicalNameMap();
  const key = compositionKey(units, canonicalMap);
  const defs = await listDefs();
  const found = [];
  const seen = new Set();
  for (const def of defs) {
    const hasMatch = (def.counters || []).some(
      (c) => c.status === "approved" && compositionKey(c.units, canonicalMap) === key
    );
    if (hasMatch && !seen.has(def.id)) {
      seen.add(def.id);
      found.push({ id: newId("vs"), monsters: def.monsters });
    }
  }
  return found;
}

function baseDeckFields({ units, turnOrder, strategy, warning, video, images, authorId, authorNickname, against }) {
  return {
    id: newId("deck"),
    units,
    turnOrder: turnOrder || [],
    strategy: strategy || "",
    warning: warning || "",
    video: video || null,
    images: images || [],
    buildName: "",
    against: against || [],
    authorId,
    authorNickname,
    createdAt: Date.now(),
    order: Date.now(),
  };
}

export async function createDeckFromScratch({ units, turnOrder, strategy, warning, video, images, authorId, authorNickname }) {
  const against = await findAutoAgainstDefs(units);
  const deck = baseDeckFields({ units, turnOrder, strategy, warning, video, images, authorId, authorNickname, against });
  await redis.set(deckKey(deck.id), deck);
  await redis.sadd(DECK_IDS_KEY, deck.id);
  return deck;
}

// Copia isolata da un counter già approvato: prende TUTTI i dati esistenti
// in quel momento (squadra, rune, artefatti, combat stats, speed tuning,
// strategia, avvertenze, allegati). Da qui in poi zero legame vivo — se il
// counter d'origine cambia, viene rifiutato o eliminato, il deck non se ne
// accorge. `focus` NON viene copiato: era legato ai bersagli sulla Difesa
// specifica di quel counter, un deck non ha una Difesa fissa associata.
export async function createDeckFromCounter(counter, { authorId, authorNickname }) {
  const units = counter.units.map((u) => ({ ...u }));
  // Riconciliazione leader (05/08/2026, Flora — Mihyang/Chilling/Mork):
  // i counter importati da Siege Log SENZA build reale catturata salvano
  // il leader solo come nome a livello di counter (`counter.lead`), non
  // come booleano per-unità (`units[].lead` restano tutti false in quel
  // caso — vedi lib/siegeStats.js). Senza questa riconciliazione, il deck
  // (che capisce solo `units[].lead`) perdeva il leader che il counter
  // mostrava comunque grazie a quel campo separato. Tocca SOLO se nessuna
  // unità ha già lead:true — un counter con la build vera catturata (o
  // corretto a mano) non viene toccato.
  if (!units.some((u) => u.lead) && counter.lead) {
    const target = normalizeMonsterName(counter.lead);
    const match = units.find((u) => normalizeMonsterName(u.name) === target);
    if (match) match.lead = true;
  }
  const against = await findAutoAgainstDefs(units);
  const deck = baseDeckFields({
    units,
    turnOrder: [...(counter.turnOrder || [])],
    strategy: counter.strategy,
    warning: counter.warning,
    video: counter.video,
    images: counter.images ? counter.images.map((i) => ({ ...i })) : [],
    authorId,
    authorNickname,
    against,
  });
  deck.copiedFromCounterId = counter.id; // solo informativo, mai riletto per sincronizzare nulla
  await redis.set(deckKey(deck.id), deck);
  await redis.sadd(DECK_IDS_KEY, deck.id);
  return deck;
}

// Duplica un deck già esistente (compresa la lista "Da usare contro"):
// utile per provare una variante di build senza toccare l'originale.
export async function duplicateDeck(id, { authorId, authorNickname }) {
  const source = await redis.get(deckKey(id));
  if (!source) return null;
  const deck = baseDeckFields({
    units: source.units.map((u) => ({ ...u })),
    turnOrder: [...(source.turnOrder || [])],
    strategy: source.strategy,
    warning: source.warning,
    video: source.video,
    images: source.images ? source.images.map((i) => ({ ...i })) : [],
    authorId,
    authorNickname,
    against: (source.against || []).map((a) => ({ ...a, id: newId("vs") })),
  });
  deck.buildName = source.buildName ? `${source.buildName} (copia)` : "";
  await redis.set(deckKey(deck.id), deck);
  await redis.sadd(DECK_IDS_KEY, deck.id);
  return deck;
}

export async function updateDeck(id, patch) {
  const deck = await redis.get(deckKey(id));
  if (!deck) return null;
  const updated = { ...deck, ...patch, id: deck.id };
  await redis.set(deckKey(id), updated);
  return updated;
}

export async function deleteDeck(id) {
  await redis.del(deckKey(id));
  await redis.srem(DECK_IDS_KEY, id);
}

export async function bulkDeleteDecks(ids) {
  if (!ids.length) return { deleted: 0 };
  const pipeline = redis.pipeline();
  for (const id of ids) {
    pipeline.del(deckKey(id));
    pipeline.srem(DECK_IDS_KEY, id);
  }
  await pipeline.exec();
  return { deleted: ids.length };
}

// Riordino manuale globale (Admin/Deck Builder): `orderedIds` è la lista
// completa nel nuovo ordine desiderato, si riscrive `order` in sequenza.
export async function reorderDecks(orderedIds) {
  // Serve il record intero per non perdere gli altri campi: mget, poi
  // riscrivo ciascuno con il nuovo `order` in un'unica pipeline.
  const raw = await redis.mget(...orderedIds.map(deckKey));
  const pipeline = redis.pipeline();
  raw.forEach((deck, i) => {
    if (deck) pipeline.set(deckKey(orderedIds[i]), { ...deck, order: i });
  });
  await pipeline.exec();
  return { reordered: orderedIds.length };
}

export async function addAgainstEntry(deckId, monsters) {
  const deck = await redis.get(deckKey(deckId));
  if (!deck) return null;
  const entry = { id: newId("vs"), monsters };
  const updated = { ...deck, against: [...(deck.against || []), entry] };
  await redis.set(deckKey(deckId), updated);
  return updated;
}

export async function removeAgainstEntry(deckId, entryId) {
  const deck = await redis.get(deckKey(deckId));
  if (!deck) return null;
  const updated = { ...deck, against: (deck.against || []).filter((a) => a.id !== entryId) };
  await redis.set(deckKey(deckId), updated);
  return updated;
}
