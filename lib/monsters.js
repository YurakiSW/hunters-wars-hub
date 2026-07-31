import { redis } from "./redis";
import { normalizeMonsterName } from "./textUtils";

const SYNCED_KEY = "monsters:synced"; // [{ name, iconUrl }] — da swarfarm, sola lettura
const MANUAL_KEY = "monsters:manual"; // [{ name, iconUrl, addedBy }] — aggiunti a mano dall'Admin
const ALIASES_KEY = "monsters:aliases"; // { "nomignolo": "Nome Ufficiale" } — mappatura nomignoli di gilda

export async function getSyncedMonsters() {
  return (await redis.get(SYNCED_KEY)) || [];
}

export async function setSyncedMonsters(list) {
  await redis.set(SYNCED_KEY, list);
  await redis.set("monsters:synced:updatedAt", Date.now());
}

export async function getManualMonsters() {
  return (await redis.get(MANUAL_KEY)) || [];
}

export async function addManualMonster({ name, iconUrl, addedBy }) {
  const list = await getManualMonsters();
  const clean = name.trim();
  const next = [...list.filter((m) => m.name.toLowerCase() !== clean.toLowerCase()), { name: clean, iconUrl: iconUrl || null, addedBy }];
  await redis.set(MANUAL_KEY, next);
  return next;
}

export async function removeManualMonster(name) {
  const list = await getManualMonsters();
  const next = list.filter((m) => m.name !== name);
  await redis.set(MANUAL_KEY, next);
  return next;
}

// --- Coppie collab <-> versione normale -------------------------------
// Ogni collab (LOTR, Cookie Run, Street Fighter, ...) esce con un mostro
// "gemello" non-collab: kit e stat base IDENTICI, ma unit_master_id, nome e
// aspetto diversi. Per il sito sono LO STESSO mostro: se non li unifichiamo,
// lo stesso counter giocato con l'uno o con l'altro genera due counter
// separati e le statistiche si spezzano in due.
//
// Formato salvato: { "nome gemello normalizzato": "Nome Canonico" }. Il
// nome canonico è quello che il sito userà per chiavi e confronti; per la
// visualizzazione teniamo comunque traccia di entrambi (vedi getTwinPairs).
const TWINS_KEY = "monsters:twins";

export async function getTwins() {
  return (await redis.get(TWINS_KEY)) || {};
}

// Coppia canonica <-> alternativa, come lista, per mostrarla in admin e per
// disegnare l'icona "mezza e mezza".
export async function getTwinPairs() {
  const twins = await getTwins();
  const byCanonical = new Map();
  for (const [alt, canonical] of Object.entries(twins)) {
    if (!byCanonical.has(canonical)) byCanonical.set(canonical, []);
    byCanonical.get(canonical).push(alt);
  }
  return [...byCanonical.entries()].map(([canonical, alts]) => ({ canonical, alts }));
}

export async function setTwin(altName, canonicalName) {
  const twins = await getTwins();
  const alt = (altName || "").trim();
  const canonical = (canonicalName || "").trim();
  if (!alt || !canonical) throw new Error("Servono entrambi i nomi.");
  if (normalizeMonsterName(alt) === normalizeMonsterName(canonical)) {
    throw new Error("I due nomi sono lo stesso mostro.");
  }
  twins[normalizeMonsterName(alt)] = canonical;
  await redis.set(TWINS_KEY, twins);
  return twins;
}

export async function removeTwin(altName) {
  const twins = await getTwins();
  delete twins[normalizeMonsterName(altName)];
  await redis.set(TWINS_KEY, twins);
  return twins;
}

// Mappa normalizzata "qualsiasi nome" -> "nome canonico", pronta da passare
// alle funzioni che costruiscono le chiavi. Include anche il canonico che
// punta a se stesso, così la risoluzione è sempre una sola lookup.
export async function getCanonicalNameMap() {
  const twins = await getTwins();
  const map = new Map();
  for (const [altNorm, canonical] of Object.entries(twins)) {
    map.set(altNorm, canonical);
    map.set(normalizeMonsterName(canonical), canonical);
  }
  return map;
}

export async function getAliases() {
  return (await redis.get(ALIASES_KEY)) || {};
}

export async function setAlias(nickname, officialName) {
  const aliases = await getAliases();
  aliases[nickname.trim()] = officialName.trim();
  await redis.set(ALIASES_KEY, aliases);
  return aliases;
}

export async function setAliasesBulk(entries) {
  const aliases = await getAliases();
  for (const [nickname, officialName] of Object.entries(entries)) {
    if (nickname?.trim() && officialName?.trim()) aliases[nickname.trim()] = officialName.trim();
  }
  await redis.set(ALIASES_KEY, aliases);
  return aliases;
}

// Elenco completo usato dall'autocomplete: sincronizzati + manuali,
// deduplicati. Le chiavi degli alias sono anch'esse nomi validi da
// selezionare (puntano a un mostro ufficiale già presente).
export async function getFullMonsterList() {
  const [synced, manual, aliases] = await Promise.all([getSyncedMonsters(), getManualMonsters(), getAliases()]);
  const byName = new Map();
  for (const m of synced) byName.set(m.name.toLowerCase(), m);
  for (const m of manual) byName.set(m.name.toLowerCase(), m);
  const aliasEntries = Object.keys(aliases).map((nickname) => ({
    name: nickname,
    iconUrl: byName.get(aliases[nickname].toLowerCase())?.iconUrl || null,
    isAlias: true,
    officialName: aliases[nickname],
  }));
  return [...byName.values(), ...aliasEntries].sort((a, b) => a.name.localeCompare(b.name));
}

export async function isKnownMonster(name) {
  const list = await getFullMonsterList();
  const target = normalizeMonsterName(name);
  return list.some((m) => normalizeMonsterName(m.name) === target);
}

// Accuracy base della specie (da swarfarm) — serve per il blocco Combat
// Stats, perché è l'unica stat base assente dal replay di Siege. Restituisce
// una mappa { nomeNormalizzato: accuracyBase } per evitare una lettura Redis
// per ogni singolo mostro di ogni singolo counter.
export async function getBaseAccuracyByName() {
  const [synced, aliases] = await Promise.all([getSyncedMonsters(), getAliases()]);
  const map = new Map();
  for (const m of synced) {
    if (m.baseAccuracy != null) map.set(normalizeMonsterName(m.name), m.baseAccuracy);
  }
  // I nomignoli di gilda puntano allo stesso mostro: stessa accuracy base.
  for (const [nickname, officialName] of Object.entries(aliases)) {
    const val = map.get(normalizeMonsterName(officialName));
    if (val != null) map.set(normalizeMonsterName(nickname), val);
  }
  return map;
}

export async function resolveMonsterIcon(name) {
  const list = await getFullMonsterList();
  const target = normalizeMonsterName(name);
  const match = list.find((m) => normalizeMonsterName(m.name) === target);
  return match?.iconUrl || null;
}
