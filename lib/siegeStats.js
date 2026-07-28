import { redis } from "./redis";
import { orderedTeamKey, defenseKey } from "./siegeLogParser";
import { createDef, createCounter, listDefs, deleteCounter } from "./defs";
import { normalizeMonsterName } from "./textUtils";

// ---------------------------------------------------------------------
// Sistema di statistiche CROSS-PLAYER: a differenza dell'import singolo
// giocatore (import-siege-log), qui accumuliamo nel tempo i risultati di
// OGNI log caricato da CHIUNQUE, per capire quali counter funzionano
// davvero contro una difesa — a prescindere da chi la possiede o da chi
// l'ha attaccata.
//
// Due livelli di chiave, come deciso con l'utente:
//  - chiave AGGREGATA (defenseKey + orderedTeamKey del counter, SENZA
//    build di rune/artefatti): decide SE proporre un counter (winRate >= 80%)
//  - chiave VARIANTE (aggregata + hash della build): decide QUALE build
//    specifica usare come bozza precompilata (quella con più winRate)
// ---------------------------------------------------------------------

const SEEN_PREFIX = "siege_battle_seen"; // set semplice di battleId già contati
const AGG_PREFIX = "siege_agg"; // hash: { wins, total }
const VARIANT_PREFIX = "siege_variant"; // hash: { wins, total, runes, artifactLeft, artifactRight per unit }
const PROPOSAL_PREFIX = "siege_proposal"; // hash: { status, currentWinRate, approvedWinRate, defId, counterId }
const PROPOSAL_INDEX_KEY = "siege_proposal:index"; // set di tutte le chiavi aggregate con una proposal
const PROPOSAL_THRESHOLD = 0.8; // soglia unica, usata ovunque nel file

function aggKey(defK, counterK) {
  return `${AGG_PREFIX}:${defK}::${counterK}`;
}
function variantKey(defK, counterK, buildHash) {
  return `${VARIANT_PREFIX}:${defK}::${counterK}::${buildHash}`;
}
function variantIndexKey(defK, counterK) {
  return `${VARIANT_PREFIX}:${defK}::${counterK}:index`; // set di buildHash viste per questa coppia
}
function proposalKey(defK, counterK) {
  return `${PROPOSAL_PREFIX}:${defK}::${counterK}`;
}

// Hash semplice (non crittografico, solo per distinguere build diverse)
// della combinazione rune+artefatti dei 3 mostri dell'offense, nell'ordine.
function buildHashFromUnits(units) {
  const parts = (units || []).map((u) => `${u.runes || ""}|${(u.artifactLeft || []).join(",")}|${(u.artifactRight || []).join(",")}`);
  return parts.join("~~") || "empty";
}

// Trova la variante con più winRate per una coppia def+counter (a parità
// di winRate, quella con più utilizzi totali) — è quella da proporre come
// bozza precompilata. A parità di merito, preferisce sempre una variante
// con rune/artefatti REALI rispetto a una "vuota" (nessuno ha aperto il
// replay completo) — altrimenti rischia di scartare una build utile solo
// perché quella senza dati ha un winRate marginalmente più alto.
async function bestVariant(defK, counterK) {
  const hashes = await redis.smembers(variantIndexKey(defK, counterK));
  if (!hashes.length) return null;
  const variants = (await Promise.all(hashes.map((h) => redis.get(variantKey(defK, counterK, h))))).filter(Boolean);
  const withUnits = variants.filter((v) => v.units);
  const pool = withUnits.length ? withUnits : variants;
  return pool.sort((a, b) => b.winRate - a.winRate || b.total - a.total)[0] || null;
}

// Dopo aver registrato un lotto di battaglie, ricalcola le proposal:
// - crea una nuova proposal "pending" se una coppia supera la soglia e non
//   ne aveva ancora una;
// - se una coppia è già "approved" (pubblicata sul sito) e la variante
//   migliore supera il winRate salvato al momento dell'approvazione, la
//   segna "update_available";
// - se una coppia già "approved" scende SOTTO la soglia con dati nuovi
//   (si scopre che in realtà non funziona), la segna "underperforming" —
//   il Counter resta pubblicato sul sito così com'è, questo è solo un
//   avviso per i gestori, non tocca nulla in automatico.
// `updatedAggByPair` arriva già calcolato da recordCrossPlayerBattles (non
// serve rileggerlo da Redis, lo abbiamo appena scritto in pipeline).
async function refreshProposals(pairs, updatedAggByPair) {
  if (!pairs.length) return;
  const existingList = await Promise.all(pairs.map((p) => redis.get(proposalKey(p.defK, p.counterK))));

  const writePipeline = redis.pipeline();
  let touched = false;
  const newIndexEntries = [];

  pairs.forEach((p, i) => {
    const agg = updatedAggByPair.get(`${p.defK}::${p.counterK}`);
    if (!agg) return;

    const existing = existingList[i];
    const pKey = proposalKey(p.defK, p.counterK);

    if (!existing) {
      // Nessuna proposal ancora per questa coppia: la creiamo solo se supera
      // già la soglia (altrimenti non c'è nulla da segnalare).
      if (agg.winRate < PROPOSAL_THRESHOLD) return;
      writePipeline.set(pKey, {
        status: "pending",
        defenseNames: p.defenseNames, offenseNames: p.offenseNames,
        defK: p.defK, counterK: p.counterK,
        currentWinRate: agg.winRate,
        approvedWinRate: null,
        defId: null, counterId: null,
        createdAt: Date.now(),
      });
      newIndexEntries.push(pKey);
      touched = true;
      return;
    }

    existing.currentWinRate = agg.winRate;
    const isPublished = existing.status === "approved" || existing.status === "update_available" || existing.status === "underperforming";
    if (isPublished) {
      if (agg.winRate < PROPOSAL_THRESHOLD) {
        existing.status = "underperforming";
      } else if (existing.approvedWinRate != null && agg.winRate > existing.approvedWinRate) {
        existing.status = "update_available";
      } else {
        existing.status = "approved";
      }
    }
    writePipeline.set(pKey, existing);
    touched = true;
  });

  if (newIndexEntries.length) writePipeline.sadd(PROPOSAL_INDEX_KEY, ...newIndexEntries);
  if (touched) await writePipeline.exec();
}

// Punto di ingresso: prende i "matchups" già tradotti in nomi (stesso
// formato usato da entriesToMatchups/lib/siegeLogParser.js) più,
// opzionalmente, le unit arricchite (rune/artefatti) per le coppie viste
// nel replay ricco — stessa struttura usata da import-siege-log.
//
// IMPORTANTE per le prestazioni: un log di una siege intera può contenere
// centinaia di battaglie. Toccare Redis una volta per battaglia (come
// prima) significa centinaia di chiamate di rete in sequenza — con log
// grandi supera facilmente il tempo limite della funzione. Qui invece:
// 1) si raggruppano le battaglie in memoria per coppia difesa+counter
//    (molte ripetono la stessa coppia, quindi le chiavi uniche sono molte
//    meno delle battaglie totali)
// 2) si legge tutto con UNA pipeline, si scrive tutto con UN'ALTRA
export async function recordCrossPlayerBattles(matchups, richUnitsByOffenseDefenseKey) {
  if (!matchups.length) return { newBattles: 0, touchedPairs: 0 };

  // Idempotenza in blocco: un'unica lettura di tutti i battleId già visti,
  // invece di una SADD per battaglia.
  const battleIds = matchups.map((m) => m.battleId).filter(Boolean);
  const alreadySeen = battleIds.length ? new Set(await redis.smembers(SEEN_PREFIX)) : new Set();
  const newBattleIds = battleIds.filter((id) => !alreadySeen.has(id));
  if (newBattleIds.length) await redis.sadd(SEEN_PREFIX, ...newBattleIds);
  const newBattleIdSet = new Set(newBattleIds);
  // Le rarissime voci senza battleId (fonte non identificabile) si contano
  // comunque — meglio contare una battaglia in più che perderla.
  const toRecord = matchups.filter((m) => !m.battleId || newBattleIdSet.has(m.battleId));
  if (!toRecord.length) return { newBattles: 0, touchedPairs: 0 };

  // Aggregazione in memoria.
  const aggDelta = new Map(); // "defK::counterK" -> { defK, counterK, wins, total, defenseNames, offenseNames }
  const variantDelta = new Map(); // "defK::counterK::buildHash" -> { defK, counterK, buildHash, wins, total, units }

  for (const m of toRecord) {
    const defK = defenseKey(m.defense);
    const counterK = orderedTeamKey(m.offense);
    const pairKey = `${defK}::${counterK}`;

    const a = aggDelta.get(pairKey) || { defK, counterK, wins: 0, total: 0, defenseNames: m.defense, offenseNames: m.offense };
    a.total++;
    if (m.win) a.wins++;
    aggDelta.set(pairKey, a);

    const richUnits = richUnitsByOffenseDefenseKey?.get(`${counterK}::${defK}`) || null;
    const buildHash = buildHashFromUnits(richUnits);
    const vKeyStr = `${pairKey}::${buildHash}`;
    const v = variantDelta.get(vKeyStr) || { defK, counterK, buildHash, wins: 0, total: 0, units: richUnits };
    v.total++;
    if (m.win) v.wins++;
    if (richUnits) v.units = richUnits;
    variantDelta.set(vKeyStr, v);
  }

  // Una pipeline per leggere i valori attuali di tutte le chiavi uniche...
  const aggEntries = Array.from(aggDelta.values());
  const variantEntries = Array.from(variantDelta.values());
  const readPipeline = redis.pipeline();
  for (const a of aggEntries) readPipeline.get(aggKey(a.defK, a.counterK));
  for (const v of variantEntries) readPipeline.get(variantKey(v.defK, v.counterK, v.buildHash));
  const readResults = aggEntries.length || variantEntries.length ? await readPipeline.exec() : [];
  const aggCurrents = readResults.slice(0, aggEntries.length);
  const variantCurrents = readResults.slice(aggEntries.length);

  // ...e un'altra per scrivere tutto insieme.
  const writePipeline = redis.pipeline();
  const updatedAggByPair = new Map();
  aggEntries.forEach((a, i) => {
    const current = aggCurrents[i] || { wins: 0, total: 0 };
    const updated = { wins: current.wins + a.wins, total: current.total + a.total };
    updated.winRate = updated.wins / updated.total;
    writePipeline.set(aggKey(a.defK, a.counterK), updated);
    updatedAggByPair.set(`${a.defK}::${a.counterK}`, updated);
  });
  const variantIndexAdds = new Map(); // "defK::counterK" -> Set(buildHash)
  variantEntries.forEach((v, i) => {
    const current = variantCurrents[i] || { wins: 0, total: 0, units: null };
    const updated = { wins: current.wins + v.wins, total: current.total + v.total, units: v.units || current.units || null };
    updated.winRate = updated.wins / updated.total;
    writePipeline.set(variantKey(v.defK, v.counterK, v.buildHash), updated);
    const idxKey = `${v.defK}::${v.counterK}`;
    if (!variantIndexAdds.has(idxKey)) variantIndexAdds.set(idxKey, new Set());
    variantIndexAdds.get(idxKey).add(v.buildHash);
  });
  for (const [idxKey, hashes] of variantIndexAdds) {
    const [defK, counterK] = idxKey.split("::");
    writePipeline.sadd(variantIndexKey(defK, counterK), ...hashes);
  }
  if (aggEntries.length || variantEntries.length) await writePipeline.exec();

  await refreshProposals(aggEntries, updatedAggByPair);
  return { newBattles: toRecord.length, touchedPairs: aggEntries.length };
}

export async function listProposals(status) {
  const keys = await redis.smembers(PROPOSAL_INDEX_KEY);
  if (!keys.length) return [];
  const all = await Promise.all(keys.map((k) => redis.get(k)));
  const filtered = all.filter(Boolean).filter((p) => !status || p.status === status);
  // Arricchisce ognuna con la variante migliore attuale, per mostrarla in
  // anteprima nella pagina di approvazione.
  return Promise.all(
    filtered.map(async (p) => ({ ...p, bestVariant: await bestVariant(p.defK, p.counterK) }))
  );
}

// Approva una proposal: crea davvero Difesa (se non esiste già una con
// quei 3 mostri) e Counter sul sito. Di default usa la variante con più
// winRate; se l'admin ha modificato la bozza a mano nel pannello prima di
// approvare, `overridePayload` sostituisce units/strategy/focus/ecc.
export async function approveProposal(defK, counterK, { authorId, authorNickname }, overridePayload) {
  const pKey = proposalKey(defK, counterK);
  const proposal = await redis.get(pKey);
  if (!proposal) throw new Error("Proposal non trovata.");

  const best = await bestVariant(defK, counterK);
  const agg = await redis.get(aggKey(defK, counterK));

  const existingDefs = await listDefs();
  const normKey = (names) => [...names].map((n) => normalizeMonsterName(n)).sort().join("|");
  let def = existingDefs.find((d) => normKey(d.monsters) === normKey(proposal.defenseNames));
  if (!def) {
    def = await createDef({
      monsters: proposal.defenseNames,
      desc: "Proposta automaticamente dal sistema di statistiche cross-player Siege Log.",
      authorId, authorNickname: `Siege Log Stats (${authorNickname})`,
      autoApprove: true,
    });
  }

  const units = overridePayload?.units || best?.units || proposal.offenseNames.map((name) => ({
    name, lead: false, runes: "", stats: "", statsFlexible: false, statsMinText: "",
    artifactLeft: [], artifactRight: [], notes: [""],
  }));
  const lead = overridePayload ? (units.find((u) => u.lead)?.name || units[0].name) : proposal.offenseNames[0];

  const counter = await createCounter(
    def.id,
    {
      offense: overridePayload ? units.map((u) => u.name) : proposal.offenseNames,
      lead,
      turnOrder: overridePayload?.turnOrder || proposal.offenseNames,
      units,
      focus: overridePayload?.focus || [],
      strategy: overridePayload?.strategy || `Proposto dal sistema Siege Log: ${agg?.wins ?? 0}/${agg?.total ?? 0} vittorie (${Math.round((agg?.winRate || 0) * 100)}%) su tutte le sieges osservate. Controlla comunque rune/artefatti/strategia.`,
      warning: overridePayload?.warning || "",
      video: overridePayload?.video || null,
      images: overridePayload?.images || [],
    },
    { authorId, authorNickname: `Siege Log Stats (${authorNickname})`, autoApprove: true }
  );

  await redis.set(pKey, {
    ...proposal,
    status: "approved",
    approvedWinRate: agg?.winRate ?? proposal.currentWinRate,
    defId: def.id,
    counterId: counter.id,
    approvedAt: Date.now(),
  });

  return { def, counter };
}

export async function rejectProposal(defK, counterK) {
  const pKey = proposalKey(defK, counterK);
  const proposal = await redis.get(pKey);
  if (!proposal) throw new Error("Proposal non trovata.");
  await redis.set(pKey, { ...proposal, status: "rejected", rejectedAt: Date.now() });
}

// L'admin ha guardato il counter segnalato "underperforming" e ha deciso
// che va bene tenerlo com'è (magari è situazionale) — torna "approved"
// senza toccare nulla sul sito, semplicemente non lo segnala più finché
// non risale ancora sotto soglia in futuro.
export async function dismissUnderperforming(defK, counterK) {
  const pKey = proposalKey(defK, counterK);
  const proposal = await redis.get(pKey);
  if (!proposal) throw new Error("Proposal non trovata.");
  await redis.set(pKey, { ...proposal, status: "approved" });
}

// L'admin ha deciso che il counter "underperforming" va tolto davvero:
// elimina il Counter pubblicato sul sito (la Difesa resta, potrebbe avere
// altri counter validi) e marca la proposal come rifiutata.
export async function unpublishProposal(defK, counterK) {
  const pKey = proposalKey(defK, counterK);
  const proposal = await redis.get(pKey);
  if (!proposal) throw new Error("Proposal non trovata.");
  if (proposal.counterId && proposal.defId) {
    await deleteCounter(proposal.defId, proposal.counterId);
  }
  await redis.set(pKey, { ...proposal, status: "rejected", defId: null, counterId: null, rejectedAt: Date.now() });
}

// Pulizia una tantum dopo aver alzato la soglia: le proposal "pending"
// create sotto la soglia vecchia non vengono ricontrollate da sole (il
// ricalcolo tocca solo le coppie che ricompaiono in un nuovo import), quindi
// senza questa funzione resterebbero in coda per sempre. Le segna come
// rifiutate (non le cancella, restano nello storico).
export async function purgePendingBelowThreshold(threshold = PROPOSAL_THRESHOLD) {
  const keys = await redis.smembers(PROPOSAL_INDEX_KEY);
  if (!keys.length) return { purged: 0 };
  const all = await Promise.all(keys.map((k) => redis.get(k)));
  const toPurge = all.filter((p) => p && p.status === "pending" && p.currentWinRate < threshold);
  if (!toPurge.length) return { purged: 0 };

  const pipeline = redis.pipeline();
  for (const p of toPurge) {
    pipeline.set(proposalKey(p.defK, p.counterK), { ...p, status: "rejected", rejectedAt: Date.now() });
  }
  await pipeline.exec();
  return { purged: toPurge.length };
}

// --- Fine season: archivia tutto (agg, variant, battle_seen, proposal) ---
// sotto una chiave separata, poi svuota le tabelle "live" così si riparte
// puliti. Le Difese/Counter già approvati e pubblicati NON vengono toccati
// (vivono in def:*/counter:*, tabelle separate) — solo i contatori.
export async function archiveAndClearSeason(seasonId) {
  if (!seasonId || typeof seasonId !== "string") throw new Error("Serve un identificativo stagione (es. \"2026S15\").");

  const proposalKeys = await redis.smembers(PROPOSAL_INDEX_KEY);
  const proposals = proposalKeys.length ? (await Promise.all(proposalKeys.map((k) => redis.get(k)))).filter(Boolean) : [];

  // Ricostruiamo anche agg/variant per l'archivio, partendo dalle proposal
  // (che referenziano defK/counterK) — copertura sufficiente perché solo le
  // coppie con winRate >= 80% arrivano a diventare proposal comunque.
  const archive = {
    seasonId,
    archivedAt: Date.now(),
    proposals,
  };
  await redis.set(`siege_stats_archive:${seasonId}`, archive);
  await redis.sadd("siege_stats_archive:index", seasonId);

  // Pulizia tabelle live. Nota: per aggKey/variantKey non teniamo un indice
  // separato (sono troppe per un set enorme), quindi le individuiamo dalle
  // proposal + dai loro indici variante.
  for (const p of proposals) {
    await redis.del(aggKey(p.defK, p.counterK));
    const variantHashes = await redis.smembers(variantIndexKey(p.defK, p.counterK));
    for (const h of variantHashes) await redis.del(variantKey(p.defK, p.counterK, h));
    await redis.del(variantIndexKey(p.defK, p.counterK));
    await redis.del(proposalKey(p.defK, p.counterK));
  }
  await redis.del(PROPOSAL_INDEX_KEY);
  await redis.del(SEEN_PREFIX);

  return { archivedProposals: proposals.length };
}

export async function listSeasonArchives() {
  const ids = await redis.smembers("siege_stats_archive:index");
  if (!ids.length) return [];
  const archives = await Promise.all(ids.map((id) => redis.get(`siege_stats_archive:${id}`)));
  return archives.filter(Boolean).sort((a, b) => b.archivedAt - a.archivedAt);
}
