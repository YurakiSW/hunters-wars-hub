import { redis } from "./redis";
import { normalizeMonsterName } from "./textUtils";

const DEF_IDS_KEY = "def:ids"; // Set di tutti gli id Difesa
const defKey = (id) => `def:${id}`;
const defCountersKey = (id) => `def:${id}:counters`; // Set di id Counter per quella Difesa
const counterKey = (id) => `counter:${id}`;

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function listDefs() {
  const ids = await redis.smembers(DEF_IDS_KEY);
  if (!ids.length) return [];
  const defs = await Promise.all(ids.map((id) => redis.get(defKey(id))));
  const withCounters = await Promise.all(
    defs.filter(Boolean).map(async (def) => {
      const counterIds = await redis.smembers(defCountersKey(def.id));
      const counters = counterIds.length ? await Promise.all(counterIds.map((cid) => redis.get(counterKey(cid)))) : [];
      return { ...def, counters: counters.filter(Boolean) };
    })
  );
  return withCounters;
}

export async function getDef(id) {
  const def = await redis.get(defKey(id));
  if (!def) return null;
  const counterIds = await redis.smembers(defCountersKey(id));
  const counters = counterIds.length ? await Promise.all(counterIds.map((cid) => redis.get(counterKey(cid)))) : [];
  return { ...def, counters: counters.filter(Boolean) };
}

export async function createDef({ monsters, desc, authorId, authorNickname, autoApprove }) {
  const id = newId("def");
  const def = {
    id,
    monsters,
    desc: desc || "",
    status: autoApprove ? "approved" : "pending",
    authorId,
    authorNickname,
    createdAt: Date.now(),
  };
  await redis.set(defKey(id), def);
  await redis.sadd(DEF_IDS_KEY, id);
  return def;
}

export async function updateDef(id, patch) {
  const def = await redis.get(defKey(id));
  if (!def) return null;
  const updated = { ...def, ...patch };
  await redis.set(defKey(id), updated);
  return updated;
}

export async function deleteDef(id) {
  const counterIds = await redis.smembers(defCountersKey(id));
  if (counterIds.length) {
    await Promise.all(counterIds.map((cid) => redis.del(counterKey(cid))));
  }
  await redis.del(defCountersKey(id));
  await redis.del(defKey(id));
  await redis.srem(DEF_IDS_KEY, id);
}

// Unisce due o più Difese doppie (stesso trio di mostri, create per
// sbaglio più volte) in una sola: tutti i Counter delle "sorgenti"
// vengono spostati dentro "keepId", poi le sorgenti vengono eliminate.
// Nessun Counter viene mai perso, solo raggruppato.
export async function mergeDefs(keepId, sourceIds) {
  let movedCounters = 0;
  for (const sourceId of sourceIds) {
    if (sourceId === keepId) continue;
    const counterIds = await redis.smembers(defCountersKey(sourceId));
    for (const cid of counterIds) {
      const counter = await redis.get(counterKey(cid));
      if (!counter) continue;
      await redis.set(counterKey(cid), { ...counter, defId: keepId });
      await redis.sadd(defCountersKey(keepId), cid);
      movedCounters++;
    }
    await redis.del(defCountersKey(sourceId));
    await redis.del(defKey(sourceId));
    await redis.srem(DEF_IDS_KEY, sourceId);
  }
  return { movedCounters };
}

export async function createCounter(defId, data, { authorId, authorNickname, autoApprove }) {
  const id = newId("counter");
  const counter = {
    id,
    defId,
    status: autoApprove ? "approved" : "pending",
    authorId,
    authorNickname,
    approvedById: autoApprove ? authorId : null,
    approvedByNickname: autoApprove ? authorNickname : null,
    offense: data.offense,
    lead: data.lead,
    turnOrder: data.turnOrder,
    units: data.units,
    focus: data.focus,
    strategy: data.strategy,
    warning: data.warning || "",
    video: data.video || null,
    images: data.images || [],
    createdAt: Date.now(),
  };
  await redis.set(counterKey(id), counter);
  await redis.sadd(defCountersKey(defId), id);
  return counter;
}

// Crea in blocco molte Difese e Counter con UNA sola pipeline (una sola
// chiamata di rete), invece di una createDef/createCounter sequenziale per
// ognuno. Usato dall'import da log SWEX, dove una siege intera può
// produrre decine o centinaia di bozze in un colpo solo — farle una per
// una supererebbe facilmente il tempo limite della funzione.
// newDefs: [{ id, monsters, desc, authorId, authorNickname, autoApprove }] — id già generato con newId("def")
// newCounters: [{ id, defId, offense, lead, turnOrder, units, focus, strategy, warning, video, images, authorId, authorNickname, autoApprove }] — id già generato con newId("counter")
export async function bulkCreateDefsAndCounters(newDefs, newCounters) {
  if (!newDefs.length && !newCounters.length) return { defsCreated: 0, countersCreated: 0 };

  const pipeline = redis.pipeline();
  for (const d of newDefs) {
    pipeline.set(defKey(d.id), {
      id: d.id, monsters: d.monsters, desc: d.desc || "",
      status: d.autoApprove ? "approved" : "pending",
      authorId: d.authorId, authorNickname: d.authorNickname, createdAt: Date.now(),
    });
    pipeline.sadd(DEF_IDS_KEY, d.id);
  }
  for (const c of newCounters) {
    pipeline.set(counterKey(c.id), {
      id: c.id, defId: c.defId,
      status: c.autoApprove ? "approved" : "pending",
      authorId: c.authorId, authorNickname: c.authorNickname,
      approvedById: c.autoApprove ? c.authorId : null,
      approvedByNickname: c.autoApprove ? c.authorNickname : null,
      offense: c.offense, lead: c.lead, turnOrder: c.turnOrder, units: c.units,
      focus: c.focus, strategy: c.strategy, warning: c.warning || "", video: c.video || null, images: c.images || [],
      createdAt: Date.now(),
    });
    pipeline.sadd(defCountersKey(c.defId), c.id);
  }
  await pipeline.exec();
  return { defsCreated: newDefs.length, countersCreated: newCounters.length };
}

export async function updateCounter(id, patch) {
  const counter = await redis.get(counterKey(id));
  if (!counter) return null;
  const updated = { ...counter, ...patch, id: counter.id, defId: counter.defId };
  await redis.set(counterKey(id), updated);
  return updated;
}

export async function deleteCounter(defId, id) {
  await redis.del(counterKey(id));
  await redis.srem(defCountersKey(defId), id);
}

export async function getCounter(id) {
  return redis.get(counterKey(id));
}

// Manutenzione (29/07/2026): prima esistevano DUE percorsi di creazione dai
// log Siege ("Import Log (nickname)" diretto, e "Siege Log Stats (nickname)"
// dal sistema proposal), unificati ora in uno solo con autore "Siege Log".
// Questa funzione sistema retroattivamente quello che era già stato creato
// prima dell'unificazione.
const LEGACY_SIEGE_AUTHOR = /^Import Log \(|^Siege Log Stats \(/;

export async function renameSiegeLogAuthors() {
  const defs = await listDefs();
  let renamed = 0;
  for (const d of defs) {
    if (LEGACY_SIEGE_AUTHOR.test(d.authorNickname || "")) {
      const { counters, ...defOnly } = d; // "counters" è un campo calcolato da listDefs, non va salvato dentro l'oggetto Difesa
      await redis.set(defKey(d.id), { ...defOnly, authorNickname: "Siege Log" });
      renamed++;
    }
    for (const c of d.counters || []) {
      if (LEGACY_SIEGE_AUTHOR.test(c.authorNickname || "")) {
        await redis.set(counterKey(c.id), { ...c, authorNickname: "Siege Log" });
        renamed++;
      }
    }
  }
  return { renamed };
}

// Strumento provvisorio (29/07/2026): le Difese create dal sistema Siege Log
// avevano una descrizione lunga e ridondante, ora ridotta a una riga sola.
// Sistema in blocco quelle GIÀ create — controlla solo l'autore ("Siege
// Log", dopo la rinomina qui sopra), mai una Difesa scritta a mano da
// qualcuno, quindi è sicuro farlo senza controllare caso per caso.
// Nota: deve restare uguale al testo scritto in approveProposal
// (lib/siegeStats.js) — se cambi uno, cambia anche l'altro.
const SIMPLIFIED_SIEGE_DESC = "Importata da Log Siege. Segnalare eventuali problemi.";

export async function simplifySiegeLogDescriptions() {
  const defs = await listDefs();
  let updated = 0;
  for (const d of defs) {
    if (d.authorNickname === "Siege Log" && d.desc !== SIMPLIFIED_SIEGE_DESC) {
      const { counters, ...defOnly } = d;
      await redis.set(defKey(d.id), { ...defOnly, desc: SIMPLIFIED_SIEGE_DESC });
      updated++;
    }
  }
  return { updated };
}

function counterHasBuildInfo(c) {
  return c.units?.some((u) => u.runes || u.artifactLeft?.length || u.artifactRight?.length);
}

// Trova gruppi di counter duplicati sulla STESSA Difesa: stesso leader
// (posizione 1), le altre 2 unit intercambiabili (non conta l'ordine) —
// nato dal bug dei due percorsi di creazione che duplicavano lo stesso
// counter da log Siege.
export async function findDuplicateCounters() {
  const defs = await listDefs();
  const groups = new Map();
  for (const d of defs) {
    for (const c of d.counters || []) {
      const [lead, ...rest] = c.offense;
      const key = `${d.id}::${normalizeMonsterName(lead)}::${rest.map((n) => normalizeMonsterName(n)).sort().join("|")}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ defId: d.id, defMonsters: d.monsters, counter: c });
    }
  }
  return Array.from(groups.values()).filter((g) => g.length > 1);
}

// Pulizia automatica: per ogni gruppo di doppioni, tiene quello con più
// informazioni (rune/artefatti presenti); a parità, quello con autore
// "Siege Log"; elimina gli altri.
export async function cleanupDuplicateCounters() {
  const dupGroups = await findDuplicateCounters();
  let removed = 0;
  for (const group of dupGroups) {
    const sorted = [...group].sort((a, b) => {
      const aHas = counterHasBuildInfo(a.counter);
      const bHas = counterHasBuildInfo(b.counter);
      if (aHas !== bHas) return aHas ? -1 : 1;
      const aSL = a.counter.authorNickname === "Siege Log";
      const bSL = b.counter.authorNickname === "Siege Log";
      if (aSL !== bSL) return aSL ? -1 : 1;
      return 0;
    });
    for (const dup of sorted.slice(1)) {
      await deleteCounter(dup.defId, dup.counter.id);
      removed++;
    }
  }
  return { groupsFound: dupGroups.length, removed };
}
