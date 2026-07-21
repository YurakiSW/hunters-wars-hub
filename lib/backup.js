import { redis } from "./redis";
import { listDefs } from "./defs";
import { getRoster, setRoster } from "./roster";
import { getManualMonsters, getAliases } from "./monsters";

const BACKUP_VERSION = 1;

// Esporta tutto quello che serve per ricostruire il sito da zero: Difese
// e Counter (con gli stessi ID, così i link non si rompono), roster,
// utenti (incluso passwordHash, già cifrato — è un backup per l'Admin,
// non un export pubblico), mostri aggiunti a mano e alias.
export async function exportAll() {
  const defs = await listDefs();
  const roster = await getRoster();
  const manualMonsters = await getManualMonsters();
  const aliases = await getAliases();

  const userKeys = await redis.keys("user:user_*");
  const users = userKeys.length ? (await Promise.all(userKeys.map((k) => redis.get(k)))).filter(Boolean) : [];

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    defs,
    roster,
    users,
    manualMonsters,
    aliases,
  };
}

// Ripristina un backup: sovrascrive completamente Difese/Counter/roster/
// utenti/mostri manuali/alias con quello che c'è nel file. Mantiene gli
// stessi ID per Difese/Counter/utenti, così i link e i login restano
// validi dopo il ripristino.
export async function restoreAll(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.defs)) {
    throw new Error("File di backup non valido.");
  }

  // Pulisce tutto quello che verrà ripristinato, per non lasciare residui
  // di dati non presenti nel backup.
  const oldDefIds = await redis.smembers("def:ids");
  for (const id of oldDefIds) {
    const counterIds = await redis.smembers(`def:${id}:counters`);
    for (const cid of counterIds) await redis.del(`counter:${cid}`);
    await redis.del(`def:${id}:counters`);
    await redis.del(`def:${id}`);
  }
  await redis.del("def:ids");

  const oldUserKeys = await redis.keys("user:user_*");
  for (const k of oldUserKeys) await redis.del(k);
  const oldEmailKeys = await redis.keys("user:byEmail:*");
  for (const k of oldEmailKeys) await redis.del(k);

  // Ricostruisce le Difese e i Counter con gli ID originali.
  for (const def of data.defs) {
    const { counters, ...defFields } = def;
    await redis.set(`def:${def.id}`, defFields);
    await redis.sadd("def:ids", def.id);
    for (const c of counters || []) {
      await redis.set(`counter:${c.id}`, c);
      await redis.sadd(`def:${def.id}:counters`, c.id);
    }
  }

  // Ricostruisce gli utenti con gli ID originali (login/sessioni restano validi).
  for (const u of data.users || []) {
    await redis.set(`user:${u.id}`, u);
    if (u.email) await redis.set(`user:byEmail:${u.email.toLowerCase()}`, u.id);
  }

  if (Array.isArray(data.roster)) await setRoster(data.roster);
  if (Array.isArray(data.manualMonsters)) await redis.set("monsters:manual", data.manualMonsters);
  if (data.aliases && typeof data.aliases === "object") await redis.set("monsters:aliases", data.aliases);

  return {
    restoredDefs: data.defs.length,
    restoredCounters: data.defs.reduce((sum, d) => sum + (d.counters?.length || 0), 0),
    restoredUsers: (data.users || []).length,
  };
}
