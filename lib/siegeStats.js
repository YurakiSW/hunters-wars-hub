import { redis } from "./redis";
import { orderedTeamKey, defenseKey } from "./siegeLogParser";
import { createDef, createCounter, listDefs, deleteCounter, updateCounter, getCounter } from "./defs";
import { normalizeMonsterName } from "./textUtils";
import { describeRuneSets, describeRuneMainStats, computeCombatStats } from "./runeSets";
import { describeUnitArtifacts } from "./artifactEffects";
import { describeUnitRelic } from "./relicEffects";

// Decodifica SEMPRE al volo da dati grezzi (rawRunes/rawArtifacts), non da
// un testo salvato in passato — così se aggiungiamo nuovi codici artefatto,
// le build già in coda (pending/approved) si aggiornano da sole appena le
// guardi, senza dover ricaricare lo stesso log. Le poche variant salvate
// PRIMA di questo cambiamento (solo testo, niente dati grezzi) restano
// mostrate come erano allora — nessun dato grezzo da cui rigenerarle.
function decodeUnitsForDisplay(units) {
  if (!units) return units;
  return units.map((u) => {
    if (!u.rawRunes && !u.rawArtifacts) return u; // formato vecchio, niente da rifare
    const artifacts = describeUnitArtifacts(u.rawArtifacts);
    return {
      name: u.name,
      lead: u.lead || false,
      runes: describeRuneSets(u.rawRunes),
      stats: u.stats || describeRuneMainStats(u.rawRunes), statsFlexible: u.statsFlexible || false, statsMinText: u.statsMinText || "",
      artifactLeft: artifacts.artifactLeft,
      artifactRight: artifacts.artifactRight,
      artifactLeftMainStat: artifacts.artifactLeftMainStat,
      artifactRightMainStat: artifacts.artifactRightMainStat,
      notes: u.notes || [""],
      spd: u.rawSpd ?? null,
      combatStats: u.combatStats || computeCombatStats(u.rawRunes, u.rawCombatBase, u.rawArtifacts, u.rawRelics),
      // Facoltativo: se manca (formato vecchio, o log senza relic) resta
      // null e il form/la card semplicemente non la mostrano — mai bloccante.
      relicMainStat: u.relicMainStat ?? describeUnitRelic(u.rawRelics),
    };
  });
}

// Ordina i nomi per SPD combat decrescente (chi agisce prima nel turno 1) —
// usata per lo Speed Tuning quando abbiamo la SPD vera dal replay. Se manca
// la SPD anche per un solo mostro, non rischiamo un ordine parziale/sbagliato
// e lasciamo l'ordine originale (di solito leader-first).
function turnOrderBySpd(units, fallbackNames) {
  if (!units?.every((u) => typeof u.spd === "number" && u.spd > 0)) return fallbackNames;
  return [...units].sort((a, b) => b.spd - a.spd).map((u) => u.name);
}

// ---------------------------------------------------------------------
// Sistema di statistiche CROSS-PLAYER: a differenza dell'import singolo
// giocatore (import-siege-log), qui accumuliamo nel tempo i risultati di
// OGNI log caricato da CHIUNQUE, per capire quali counter funzionano
// davvero contro una difesa — a prescindere da chi la possiede o da chi
// l'ha attaccata.
//
// Due livelli di chiave, come deciso con l'utente:
//  - chiave AGGREGATA (defenseKey + orderedTeamKey del counter, SENZA
//    build di rune/artefatti): decide SE proporre un counter (winRate >= 90%)
//  - chiave VARIANTE (aggregata + hash della build): decide QUALE build
//    specifica usare come bozza precompilata (quella con più winRate)
// ---------------------------------------------------------------------

const SEEN_PREFIX = "siege_battle_seen"; // set semplice di battleId già contati
const AGG_PREFIX = "siege_agg"; // hash: { wins, total }
const VARIANT_PREFIX = "siege_variant"; // hash: { wins, total, runes, artifactLeft, artifactRight per unit }
const PROPOSAL_PREFIX = "siege_proposal"; // hash: { status, currentWinRate, approvedWinRate, defId, counterId }
const PROPOSAL_INDEX_KEY = "siege_proposal:index"; // set di tutte le chiavi aggregate con una proposal
const PROPOSAL_THRESHOLD = 0.9; // soglia unica, usata ovunque nel file

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
  // Compatibile sia col nuovo formato (dati grezzi) sia col vecchio (testo
  // già tradotto, per le varianti salvate prima di questo cambiamento).
  const parts = (units || []).map((u) => {
    if (u.rawRunes || u.rawArtifacts || u.rawRelics) {
      return JSON.stringify([u.rawRunes || [], u.rawArtifacts || [], u.rawRelics || []]);
    }
    return `${u.runes || ""}|${(u.artifactLeft || []).join(",")}|${(u.artifactRight || []).join(",")}`;
  });
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

  // Per non perdere il collegamento con un Counter già pubblicato quando una
  // proposal viene ricreata da zero (es. dopo un Fine Season, che cancella
  // le proposal ma MAI le Difese/Counter reali): mappa "defK::counterK" ->
  // {defId, counterId} per tutto ciò che esiste già sul sito, controllando
  // sia il formato chiave nuovo (leader+sorted) che quello vecchio (ordine
  // esatto), per compatibilità con counter creati prima del 29/07/2026.
  const existingDefs = await listDefs();
  const publishedByKey = new Map();
  for (const d of existingDefs) {
    const dK = defenseKey(d.monsters);
    for (const c of d.counters || []) {
      publishedByKey.set(`${dK}::${orderedTeamKey(c.offense)}`, { defId: d.id, counterId: c.id });
      publishedByKey.set(`${dK}::${legacyOrderedTeamKey(c.offense)}`, { defId: d.id, counterId: c.id });
    }
  }

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
      // Se un Counter per questa esatta coppia esiste GIÀ sul sito,
      // agganciamolo subito come "già approvato" invece di trattarlo come
      // scollegato — altrimenti una futura approvazione ne creerebbe un
      // secondo, duplicato, invece di aggiornare quello esistente.
      const already = publishedByKey.get(`${p.defK}::${p.counterK}`);
      writePipeline.set(pKey, {
        status: already ? "approved" : "pending",
        defenseNames: p.defenseNames, offenseNames: p.offenseNames,
        defK: p.defK, counterK: p.counterK,
        currentWinRate: agg.winRate,
        approvedWinRate: already ? agg.winRate : null,
        defId: already?.defId || null, counterId: already?.counterId || null,
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
    } else if (existing.status === "pending" && agg.winRate < PROPOSAL_THRESHOLD) {
      // Era "in attesa" ma con dati nuovi è scesa sotto soglia — non ha mai
      // senso lasciarla lì a mostrare un numero sbagliato finché qualcuno
      // non preme "Pulisci" a mano. Va dritta in rifiutate.
      existing.status = "rejected";
      existing.rejectedAt = Date.now();
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
  // Arricchisce ognuna con la variante migliore attuale, decodificata al
  // volo (non un testo salvato in passato) per mostrarla in anteprima.
  return Promise.all(
    filtered.map(async (p) => {
      const best = await bestVariant(p.defK, p.counterK);
      if (best) best.units = decodeUnitsForDisplay(best.units);
      return { ...p, bestVariant: best };
    })
  );
}

// Approva una proposal: crea davvero Difesa (se non esiste già una con
// quei 3 mostri) e Counter sul sito. Di default usa la variante con più
// winRate; se l'admin ha modificato la bozza a mano nel pannello prima di
// approvare, `overridePayload` sostituisce units/strategy/focus/ecc.
export async function approveProposal(defK, counterK, { authorId: approverId, authorNickname: approverNickname }, overridePayload) {
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
      desc: "Importata da Log Siege. Segnalare eventuali problemi.",
      authorId: approverId, authorNickname: "Siege Log",
      autoApprove: true,
    });
  }

  const units = overridePayload?.units || decodeUnitsForDisplay(best?.units) || proposal.offenseNames.map((name) => ({
    name, lead: false, runes: "", stats: "", statsFlexible: false, statsMinText: "",
    artifactLeft: [], artifactRight: [], notes: [""],
  }));
  const lead = overridePayload ? (units.slice(0, 3).find((u) => u.lead)?.name || units[0].name) : proposal.offenseNames[0];

  // Se sto approvando "al volo" (senza passare da "Modifica e approva") e
  // manca la build vera (nessun replay completo l'ha mai catturata), il
  // Counter risultante resta "in attesa" come uno normale — serve
  // completarlo a mano prima che vada live, non basta il winRate a
  // renderlo pubblicabile senza rune/artefatti/strategia reali.
  const hasRealBuild = units.some((u) => u.runes || u.artifactLeft?.length || u.artifactRight?.length);
  const autoApprove = !!overridePayload || hasRealBuild;

  const counterData = {
    offense: overridePayload ? units.slice(0, 3).map((u) => u.name) : proposal.offenseNames,
    lead,
    turnOrder: overridePayload?.turnOrder || turnOrderBySpd(units, proposal.offenseNames),
    units,
    focus: overridePayload?.focus || [],
    strategy: overridePayload?.strategy || `Proposto dal sistema Siege Log: ${agg?.wins ?? 0}/${agg?.total ?? 0} vittorie (${Math.round((agg?.winRate || 0) * 100)}%) su tutte le sieges osservate. Controlla comunque rune/artefatti/strategia.`,
    warning: overridePayload?.warning || "",
    video: overridePayload?.video || null,
    images: overridePayload?.images || [],
  };

  // Se questa proposal era già stata approvata prima (defId/counterId
  // esistenti — es. accettando un "Aggiornamento disponibile"), aggiorna
  // lo STESSO Counter con la build nuova invece di crearne un secondo:
  // altrimenti resterebbero pubblicati due counter identici sulla stessa
  // Difesa, uno con le rune vecchie e uno con quelle nuove.
  let counter;
  const existingCounter = proposal.counterId ? await getCounter(proposal.counterId) : null;
  if (existingCounter) {
    counter = await updateCounter(proposal.counterId, {
      ...counterData,
      status: autoApprove ? "approved" : "pending",
      approvedById: autoApprove ? approverId : null,
      approvedByNickname: autoApprove ? approverNickname : null,
    });
  } else {
    counter = await createCounter(
      def.id,
      counterData,
      { authorId: approverId, authorNickname: "Siege Log", autoApprove, approvedById: approverId, approvedByNickname: approverNickname }
    );
  }

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

// Elimina DEFINITIVAMENTE una proposal (tolta anche dall'indice, non solo
// segnata "rejected") — per ripulire quelle rifiutate che non servono più.
// Non tocca mai un eventuale Counter già pubblicato (se c'era, va rimosso a
// parte con "unpublish" prima, o dal pannello Difese/Counter).
export async function deleteProposal(defK, counterK) {
  const pKey = proposalKey(defK, counterK);
  await redis.del(pKey);
  await redis.srem(PROPOSAL_INDEX_KEY, pKey);
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

  const archive = {
    seasonId,
    archivedAt: Date.now(),
    proposals,
  };
  await redis.set(`siege_stats_archive:${seasonId}`, archive);
  await redis.sadd("siege_stats_archive:index", seasonId);

  // Pulizia tabelle live. IMPORTANTE: scansioniamo DIRETTAMENTE tutte le
  // chiavi con questi prefissi (redis.keys), invece di fidarci solo di un
  // indice — un indice può avere buchi (es. dati già esistenti PRIMA che
  // l'indice stesso venisse introdotto, bug scoperto il 29/07/2026: quei
  // dati non finiscono mai nell'indice e restano orfani per sempre). Con
  // la scansione diretta, qualunque cosa esista con questi prefissi viene
  // trovata e cancellata, a prescindere da quando è stata creata.
  const [aggKeysFound, variantKeysFound, proposalKeysFound] = await Promise.all([
    redis.keys(`${AGG_PREFIX}:*`),
    redis.keys(`${VARIANT_PREFIX}:*`),
    redis.keys(`${PROPOSAL_PREFIX}:*`),
  ]);
  const allKeysToDelete = [...aggKeysFound, ...variantKeysFound, ...proposalKeysFound];
  if (allKeysToDelete.length) {
    const deletePipeline = redis.pipeline();
    for (const k of allKeysToDelete) deletePipeline.del(k);
    await deletePipeline.exec();
  }
  await redis.del(PROPOSAL_INDEX_KEY);
  await redis.del(SEEN_PREFIX);

  return { archivedProposals: proposals.length, keysCleared: allKeysToDelete.length };
}

export async function listSeasonArchives() {
  const ids = await redis.smembers("siege_stats_archive:index");
  if (!ids.length) return [];
  const archives = await Promise.all(ids.map((id) => redis.get(`siege_stats_archive:${id}`)));
  return archives.filter(Boolean).sort((a, b) => b.archivedAt - a.archivedAt);
}

// Cancella un'archiviazione (es. quelle create per test/prova) — non tocca
// mai Difese/Counter pubblicati, solo lo snapshot archiviato stesso.
export async function deleteSeasonArchive(seasonId) {
  await redis.del(`siege_stats_archive:${seasonId}`);
  await redis.srem("siege_stats_archive:index", seasonId);
}

// Prima della modifica del 29/07/2026, orderedTeamKey manteneva l'ordine
// ESATTO delle 3 unit (non solo il leader fisso + le altre 2 in ordine
// qualsiasi). I dati salvati PRIMA di quella modifica usano ancora questo
// vecchio formato — serve come fallback quando la chiave nuova non trova
// nulla, altrimenti perderemmo l'accesso a tutto quello salvato prima.
function legacyOrderedTeamKey(names) {
  return names.map((n) => normalizeMonsterName(n)).join("|");
}

// Recupero una tantum (29/07/2026): i counter già approvati PRIMA di questo
// aggiornamento hanno rune/artefatti "congelati" come testo — non si
// aggiornano da soli. Ma se i dati grezzi della stessa coppia difesa+
// counter esistono ANCORA in siege_variant (non ancora cancellati da un
// Fine Season), possiamo recuperarli da lì e completare SOLO quello che
// manca o è ancora "sconosciuto" — non tocca mai un campo già scritto a
// mano dall'admin. Finestra di tempo limitata: sparisce con Fine Season.
export async function resyncApprovedCounters() {
  const defs = await listDefs();
  let checked = 0;
  let foundData = 0;
  let updated = 0;
  const examples = [];
  for (const d of defs) {
    for (const c of d.counters || []) {
      if (c.status !== "approved" || !c.units?.length) continue;
      checked++;
      let changed = false;

      // Il leader è sempre la prima unit per convenzione — questo non
      // dipende dai dati grezzi, si corregge sempre.
      let newUnits = c.units.map((u, i) => {
        const shouldBeLead = i === 0;
        if (!!u.lead !== shouldBeLead) { changed = true; return { ...u, lead: shouldBeLead }; }
        return u;
      });

      const defK = defenseKey(d.monsters);
      let best = await bestVariant(defK, orderedTeamKey(c.offense));
      let usedLegacy = false;
      if (!best?.units) {
        best = await bestVariant(defK, legacyOrderedTeamKey(c.offense));
        usedLegacy = true;
      }

      let newTurnOrder = c.turnOrder;
      if (best?.units) {
        foundData++;
        const decoded = decodeUnitsForDisplay(best.units);
        const recomputedTurnOrder = turnOrderBySpd(decoded, null);
        if (recomputedTurnOrder && JSON.stringify(recomputedTurnOrder) !== JSON.stringify(c.turnOrder)) {
          newTurnOrder = recomputedTurnOrder;
          changed = true;
        }
        newUnits = newUnits.map((u, i) => {
          const fresh = decoded[i];
          if (!fresh || fresh.name !== u.name) {
            if (examples.length < 5) examples.push({ offense: c.offense, defense: d.monsters, reason: `nome non combacia in posizione ${i}: counter ha "${u.name}", dati grezzi hanno "${fresh?.name}"`, usedLegacy });
            return u;
          }
          const patch = { ...u };
          if (!u.runes && !u.statsFlexible && fresh.runes) { patch.runes = fresh.runes; changed = true; }
          if (!u.stats && !u.statsFlexible && fresh.stats) { patch.stats = fresh.stats; changed = true; }
          // CombatStats/relic/main stat artefatti: qui SEMPRE sovrascritti
          // con quelli freschi (non solo se mancanti) — a differenza di
          // rune/stats (che l'utente potrebbe aver scelto apposta a mano),
          // questi sono valori puramente calcolati dai dati grezzi, quindi
          // se il dato grezzo c'è è sempre più affidabile di quello salvato
          // (specie oggi 30/07/2026, dopo il fix della formula HP/ATK/DEF/
          // SPD/Resistance che prima era palesemente sbagliata).
          if (fresh.combatStats && JSON.stringify(fresh.combatStats) !== JSON.stringify(u.combatStats || null)) {
            patch.combatStats = fresh.combatStats; changed = true;
          }
          if (fresh.relicMainStat !== (u.relicMainStat || null)) {
            patch.relicMainStat = fresh.relicMainStat; changed = true;
          }
          if (fresh.artifactLeftMainStat !== (u.artifactLeftMainStat || null)) {
            patch.artifactLeftMainStat = fresh.artifactLeftMainStat; changed = true;
          }
          if (fresh.artifactRightMainStat !== (u.artifactRightMainStat || null)) {
            patch.artifactRightMainStat = fresh.artifactRightMainStat; changed = true;
          }
          patch.artifactLeft = (u.artifactLeft || []).map((text, idx) => {
            const freshText = fresh.artifactLeft?.[idx];
            if (text?.startsWith("Effetto sconosciuto") && freshText && !freshText.startsWith("Effetto sconosciuto")) {
              changed = true;
              return freshText;
            }
            return text;
          });
          patch.artifactRight = (u.artifactRight || []).map((text, idx) => {
            const freshText = fresh.artifactRight?.[idx];
            if (text?.startsWith("Effetto sconosciuto") && freshText && !freshText.startsWith("Effetto sconosciuto")) {
              changed = true;
              return freshText;
            }
            return text;
          });
          return patch;
        });
      } else if (examples.length < 5) {
        examples.push({ offense: c.offense, defense: d.monsters, reason: "nessun dato grezzo trovato (né formato nuovo né vecchio)" });
      }

      if (changed) {
        await updateCounter(c.id, { units: newUnits, turnOrder: newTurnOrder });
        updated++;
      } else if (best?.units && examples.length < 5) {
        examples.push({ offense: c.offense, defense: d.monsters, reason: "dati grezzi trovati ma già tutto tradotto (nulla da cambiare)", usedLegacy });
      }
    }
  }
  return { checked, foundData, updated, examples };
}
