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

export async function resolveMonsterIcon(name) {
  const list = await getFullMonsterList();
  const target = normalizeMonsterName(name);
  const match = list.find((m) => normalizeMonsterName(m.name) === target);
  return match?.iconUrl || null;
}
