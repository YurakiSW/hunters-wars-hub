import { redis } from "./redis";
import { normalizeMonsterName } from "./textUtils";
import { getCanonicalNameMap } from "./monsters";

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

  // Stessa cura già applicata a Difese Gilda: con 100+ Difese, fare una
  // richiesta separata per ogni insieme di counter (anche se in parallelo
  // con Promise.all) significa comunque centinaia di chiamate HTTP
  // individuali verso Upstash. Una pipeline per gli insiemi ID + un mget
  // per tutti i record riduce tutto a 2-3 chiamate totali.
  const defsRaw = await redis.mget(...ids.map(defKey));
  const defs = defsRaw.filter(Boolean);
  if (!defs.length) return [];

  const pipeline = redis.pipeline();
  for (const def of defs) pipeline.smembers(defCountersKey(def.id));
  const counterIdSets = await pipeline.exec(); // stesso ordine di defs

  const allCounterIds = [];
  const idsByDef = [];
  for (let i = 0; i < defs.length; i++) {
    const cIds = counterIdSets[i] || [];
    idsByDef.push(cIds);
    allCounterIds.push(...cIds);
  }

  const allCounters = allCounterIds.length ? await redis.mget(...allCounterIds.map(counterKey)) : [];
  const counterById = new Map();
  allCounterIds.forEach((cid, i) => { if (allCounters[i]) counterById.set(cid, allCounters[i]); });

  return defs.map((def, i) => ({
    ...def,
    counters: idsByDef[i].map((cid) => counterById.get(cid)).filter(Boolean),
  }));
}

export async function getDef(id) {
  const def = await redis.get(defKey(id));
  if (!def) return null;
  const counterIds = await redis.smembers(defCountersKey(id));
  const counters = counterIds.length ? await Promise.all(counterIds.map((cid) => redis.get(counterKey(cid)))) : [];
  return { ...def, counters: counters.filter(Boolean) };
}

// Cerca una Difesa già esistente che collida con la terna proposta. Il
// PRIMO mostro è il leader per convenzione (stessa usata altrove, es.
// nell'ordinamento della pagina Counters) — niente campo esplicito, a
// differenza dei Counter che invece un campo `lead` vero ce l'hanno e non
// si affidano alla sola posizione.
//   - stesso leader + stessi altri 2 (ordine libero) -> è la STESSA difesa
//   - stessi 3 mostri ma leader diverso -> è una difesa DIVERSA (il leader
//     cambia le buff di squadra, quindi cambia davvero l'incontro)
// Restituisce { exact, sameTrioDifferentLeader } — al chiamante la scelta
// di cosa fare in ciascun caso.
export async function findMatchingDef(monsters, excludeDefId) {
  const defs = (await listDefs()).filter((d) => d.id !== excludeDefId);
  const canonicalMap = await getCanonicalNameMap();
  const canon = (n) => normalizeMonsterName(canonicalMap.get(normalizeMonsterName(n)) || n);
  const [lead, ...rest] = monsters;
  const leadC = canon(lead);
  const restC = rest.map(canon).sort().join("|");
  const allC = new Set(monsters.map(canon));

  let exact = null;
  let sameTrioDifferentLeader = null;
  for (const d of defs) {
    const [dLead, ...dRest] = d.monsters;
    const dLeadC = canon(dLead);
    const dRestC = dRest.map(canon).sort().join("|");
    if (dLeadC === leadC && dRestC === restC) { exact = d; break; }
    const dAllC = new Set(d.monsters.map(canon));
    if (!sameTrioDifferentLeader && dAllC.size === allC.size && [...dAllC].every((m) => allC.has(m))) {
      sameTrioDifferentLeader = d;
    }
  }
  return { exact, sameTrioDifferentLeader };
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

// Toglie il pin da TUTTE le Difese in un colpo solo — serve quando il meta
// del gioco cambia e le difese fissate in cima non hanno più senso, invece
// di doverle togliere una per una.
export async function unpinAllDefs() {
  const defs = await listDefs();
  const pinned = defs.filter((d) => d.pinned);
  if (!pinned.length) return { unpinned: 0 };
  const pipeline = redis.pipeline();
  for (const d of pinned) pipeline.set(defKey(d.id), { ...d, pinned: false });
  await pipeline.exec();
  return { unpinned: pinned.length };
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

// Trova gruppi di DIFESE che sono in realtà la stessa difesa, a meno delle
// versioni collab/normale dello stesso mostro (es. "Dark Ciri / Son Zhang
// Lao / Driana" e "Fiona / Son Zhang Lao / Driana" quando Dark Ciri e Fiona
// sono registrate come coppia). Nascono così: erano già sul sito PRIMA che
// la coppia venisse registrata, quindi l'import le aveva viste come diverse.
export async function findEquivalentDefs() {
  const defs = await listDefs();
  const canonicalMap = await getCanonicalNameMap();
  const canon = (n) => normalizeMonsterName(canonicalMap.get(normalizeMonsterName(n)) || n);
  const groups = new Map();
  for (const d of defs) {
    const key = [...d.monsters].map(canon).sort().join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  return Array.from(groups.values()).filter((g) => g.length > 1);
}

// Unisce i gruppi trovati da findEquivalentDefs: tiene la Difesa con più
// counter (a parità, la più vecchia) e ci sposta dentro tutti gli altri.
// I counter doppioni che ne risultano si tolgono poi con "Pulisci counter
// doppi", che già ragiona sui nomi canonici.
export async function mergeEquivalentDefs() {
  const groups = await findEquivalentDefs();
  let mergedDefs = 0;
  let movedCounters = 0;
  for (const group of groups) {
    const sorted = [...group].sort(
      (a, b) => (b.counters?.length || 0) - (a.counters?.length || 0) || String(a.id).localeCompare(String(b.id))
    );
    const keep = sorted[0];
    const sources = sorted.slice(1).map((d) => d.id);
    const res = await mergeDefs(keep.id, sources);
    movedCounters += res.movedCounters;
    mergedDefs += sources.length;
  }
  return { groups: groups.length, mergedDefs, movedCounters };
}

export async function createCounter(defId, data, { authorId, authorNickname, autoApprove, approvedById, approvedByNickname }) {
  const id = newId("counter");
  const counter = {
    id,
    defId,
    status: autoApprove ? "approved" : "pending",
    authorId,
    authorNickname,
    approvedById: autoApprove ? (approvedById ?? authorId) : null,
    approvedByNickname: autoApprove ? (approvedByNickname ?? authorNickname) : null,
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

function counterHasBuildInfo(c) {
  return c.units?.some((u) => u.runes || u.artifactLeft?.length || u.artifactRight?.length);
}

// Trova gruppi di counter duplicati sulla STESSA Difesa: stesso leader
// (posizione 1), le altre 2 unit intercambiabili (non conta l'ordine) —
// nato dal bug dei due percorsi di creazione che duplicavano lo stesso
// counter da log Siege.
export async function findDuplicateCounters() {
  const defs = await listDefs();
  // Anche qui i nomi passano per il canonico: due counter uguali ma giocati
  // uno con la versione collab e uno con quella normale sono lo stesso
  // counter, e vanno riconosciuti come doppioni da unire.
  const canonicalMap = await getCanonicalNameMap();
  const canon = (n) => normalizeMonsterName(canonicalMap.get(normalizeMonsterName(n)) || n);
  const groups = new Map();
  for (const d of defs) {
    for (const c of d.counters || []) {
      const [lead, ...rest] = c.offense;
      const key = `${d.id}::${canon(lead)}::${rest.map(canon).sort().join("|")}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ defId: d.id, defMonsters: d.monsters, counter: c });
    }
  }
  return Array.from(groups.values()).filter((g) => g.length > 1);
}

// Pulizia automatica: per ogni gruppo di doppioni, tiene quello con più
// informazioni (rune/artefatti presenti); a parità, quello con autore
// "Siege Log"; elimina gli altri.
// Pulizia automatica dei doppioni. REGOLA DI SICUREZZA: un counter scritto
// da una persona non viene MAI cancellato in automatico. Il motivo è che i
// contenuti umani (note, strategia, scelte ragionate) non sono
// ricostruibili, mentre un counter da Siege Log si rigenera al prossimo
// import — quindi in caso di dubbio si sacrifica quello.
//   - gruppo con almeno un counter umano  -> si cancellano solo i "Siege Log"
//   - gruppo di soli "Siege Log"          -> si tiene il più informativo
//   - gruppo con 2+ counter umani         -> non si tocca niente, si segnala
export async function cleanupDuplicateCounters() {
  const dupGroups = await findDuplicateCounters();
  let removed = 0;
  const needsReview = [];
  for (const group of dupGroups) {
    // "Da log" solo se nessuno l'ha corretto a mano: una volta che una
    // persona ci ha messo mano, vale come contenuto umano a tutti gli effetti.
    const isFromLog = (e) => e.counter.authorNickname === "Siege Log" && !e.counter.manuallyEdited;
    const manual = group.filter((e) => !isFromLog(e));
    const fromLog = group.filter(isFromLog);

    if (manual.length > 1) {
      // Più counter scritti a mano che si equivalgono: è una scelta
      // editoriale, non la decide un automatismo.
      needsReview.push({
        defMonsters: group[0].defMonsters,
        offense: group[0].counter.offense,
        authors: manual.map((e) => e.counter.authorNickname),
      });
      continue;
    }

    // Se c'è esattamente un counter umano lo si tiene sempre, e si eliminano
    // i doppioni generati dal log. Altrimenti si sceglie il migliore tra
    // quelli da log.
    const toDelete = manual.length === 1
      ? fromLog
      : [...fromLog].sort((a, b) => {
          const aHas = counterHasBuildInfo(a.counter);
          const bHas = counterHasBuildInfo(b.counter);
          if (aHas !== bHas) return aHas ? -1 : 1;
          return 0;
        }).slice(1);

    for (const dup of toDelete) {
      await deleteCounter(dup.defId, dup.counter.id);
      removed++;
    }
  }
  return { groupsFound: dupGroups.length, removed, needsReview };
}
