import { redis } from "./redis";
import { listDefs } from "./defs";

const BACKUP_VERSION = 2;

// Backup di SOLO Difese e Counter (con gli stessi ID, così i link non si
// rompono). Roster e utenti restano fuori apposta: il roster si ricarica
// dal gioco quando serve, e un backup con dentro password cifrate/email
// non deve girare in un file scaricabile senza un vero bisogno.
export async function exportAll() {
  const defs = await listDefs();
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    defs,
  };
}

// Ripristina un backup: sovrascrive completamente Difese e Counter con
// quello che c'è nel file. Mantiene gli stessi ID, così i link restano
// validi dopo il ripristino. Non tocca utenti, roster o mostri.
export async function restoreAll(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.defs)) {
    throw new Error("File di backup non valido.");
  }

  const oldDefIds = await redis.smembers("def:ids");
  for (const id of oldDefIds) {
    const counterIds = await redis.smembers(`def:${id}:counters`);
    for (const cid of counterIds) await redis.del(`counter:${cid}`);
    await redis.del(`def:${id}:counters`);
    await redis.del(`def:${id}`);
  }
  await redis.del("def:ids");

  for (const def of data.defs) {
    const { counters, ...defFields } = def;
    await redis.set(`def:${def.id}`, defFields);
    await redis.sadd("def:ids", def.id);
    for (const c of counters || []) {
      await redis.set(`counter:${c.id}`, c);
      await redis.sadd(`def:${def.id}:counters`, c.id);
    }
  }

  return {
    restoredDefs: data.defs.length,
    restoredCounters: data.defs.reduce((sum, d) => sum + (d.counters?.length || 0), 0),
  };
}
