import { redis } from "./redis";

const DEF_IDS_KEY = "def:ids"; // Set di tutti gli id Difesa
const defKey = (id) => `def:${id}`;
const defCountersKey = (id) => `def:${id}:counters`; // Set di id Counter per quella Difesa
const counterKey = (id) => `counter:${id}`;

function newId(prefix) {
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

export async function createCounter(defId, data, { authorId, authorNickname, autoApprove }) {
  const id = newId("counter");
  const counter = {
    id,
    defId,
    status: autoApprove ? "approved" : "pending",
    authorId,
    authorNickname,
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
