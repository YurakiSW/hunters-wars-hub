import { redis } from "./redis";
import { orderedTeamKey, defenseKey } from "./siegeLogParser";
import { createDef, createCounter, listDefs } from "./defs";
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
//    build di rune/artefatti): decide SE proporre un counter (winRate >= 50%)
//  - chiave VARIANTE (aggregata + hash della build): decide QUALE build
//    specifica usare come bozza precompilata (quella con più winRate)
// ---------------------------------------------------------------------

const SEEN_PREFIX = "siege_battle_seen"; // set semplice di battleId già contati
const AGG_PREFIX = "siege_agg"; // hash: { wins, total }
const VARIANT_PREFIX = "siege_variant"; // hash: { wins, total, runes, artifactLeft, artifactRight per unit }
const PROPOSAL_PREFIX = "siege_proposal"; // hash: { status, currentWinRate, approvedWinRate, defId, counterId }
const PROPOSAL_INDEX_KEY = "siege_proposal:index"; // set di tutte le chiavi aggregate con una proposal

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

// Registra UNA battaglia (defK/counterK già calcolati dal chiamante, che
// li riusa anche per raggruppare le proposal) e aggiorna aggregato +
// variante. Ritorna true se questa battaglia era nuova (non ancora vista),
// false se già contata prima (idempotenza: reimportare lo stesso log non
// gonfia le statistiche).
async function recordOne(matchup, defK, counterK, richUnits) {
  if (matchup.battleId) {
    const isNew = await redis.sadd(SEEN_PREFIX, matchup.battleId);
    if (!isNew) return false; // già vista, non ricontare
  }

  const aKey = aggKey(defK, counterK);
  const agg = (await redis.get(aKey)) || { wins: 0, total: 0 };
  agg.total++;
  if (matchup.win) agg.wins++;
  agg.winRate = agg.wins / agg.total;
  await redis.set(aKey, agg);

  const buildHash = buildHashFromUnits(richUnits);
  const vKey = variantKey(defK, counterK, buildHash);
  const variant = (await redis.get(vKey)) || { wins: 0, total: 0, units: richUnits || null };
  variant.total++;
  if (matchup.win) variant.wins++;
  variant.winRate = variant.wins / variant.total;
  if (richUnits) variant.units = richUnits; // aggiorna sempre con l'ultima build vista completa
  await redis.set(vKey, variant);
  await redis.sadd(variantIndexKey(defK, counterK), buildHash);

  return true;
}

// Trova la variante con più winRate per una coppia def+counter (a parità
// di winRate, quella con più utilizzi totali) — è quella da proporre come
// bozza precompilata.
async function bestVariant(defK, counterK) {
  const hashes = await redis.smembers(variantIndexKey(defK, counterK));
  if (!hashes.length) return null;
  const variants = await Promise.all(hashes.map((h) => redis.get(variantKey(defK, counterK, h))));
  return variants.filter(Boolean).sort((a, b) => b.winRate - a.winRate || b.total - a.total)[0] || null;
}

// Dopo aver registrato un lotto di battaglie, ricalcola le proposal:
// crea una nuova proposal "pending" se una coppia def+counter supera il
// 50% e non ne aveva ancora una; se una coppia è già "approved" e la
// variante migliore attuale supera il winRate salvato al momento
// dell'approvazione, la segna come "update_available".
async function refreshProposals(pairs) {
  for (const { defK, counterK, defenseNames, offenseNames } of pairs) {
    const agg = await redis.get(aggKey(defK, counterK));
    if (!agg || agg.winRate < 0.5) continue;

    const pKey = proposalKey(defK, counterK);
    const existing = await redis.get(pKey);

    if (!existing) {
      await redis.set(pKey, {
        status: "pending",
        defenseNames, offenseNames,
        defK, counterK,
        currentWinRate: agg.winRate,
        approvedWinRate: null,
        defId: null, counterId: null,
        createdAt: Date.now(),
      });
      await redis.sadd(PROPOSAL_INDEX_KEY, pKey);
      continue;
    }

    existing.currentWinRate = agg.winRate;
    if (existing.status === "approved" && existing.approvedWinRate != null && agg.winRate > existing.approvedWinRate) {
      existing.status = "update_available";
    }
    await redis.set(pKey, existing);
  }
}

// Punto di ingresso: prende i "matchups" già tradotti in nomi (stesso
// formato usato da entriesToMatchups/lib/siegeLogParser.js) più,
// opzionalmente, le unit arricchite (rune/artefatti) per le coppie viste
// nel replay ricco — stessa struttura usata da import-siege-log.
export async function recordCrossPlayerBattles(matchups, richUnitsByOffenseDefenseKey) {
  let newBattles = 0;
  const touchedPairs = new Map();

  for (const m of matchups) {
    const defK = defenseKey(m.defense);
    const counterK = orderedTeamKey(m.offense);
    const richUnits = richUnitsByOffenseDefenseKey?.get(`${counterK}::${defK}`) || null;

    const wasNew = await recordOne(m, defK, counterK, richUnits);
    if (wasNew) newBattles++;
    touchedPairs.set(`${defK}::${counterK}`, { defK, counterK, defenseNames: m.defense, offenseNames: m.offense });
  }

  await refreshProposals(Array.from(touchedPairs.values()));
  return { newBattles, touchedPairs: touchedPairs.size };
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
// quei 3 mostri) e Counter sul sito, usando la variante con più winRate.
// Se la Difesa esiste già, aggiunge solo il Counter.
export async function approveProposal(defK, counterK, { authorId, authorNickname }) {
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

  const units = best?.units || proposal.offenseNames.map((name) => ({
    name, lead: false, runes: "", stats: "", statsFlexible: false, statsMinText: "",
    artifactLeft: [], artifactRight: [], notes: [""],
  }));

  const counter = await createCounter(
    def.id,
    {
      offense: proposal.offenseNames,
      lead: proposal.offenseNames[0],
      turnOrder: proposal.offenseNames,
      units,
      focus: [],
      strategy: `Proposto dal sistema Siege Log: ${agg?.wins ?? 0}/${agg?.total ?? 0} vittorie (${Math.round((agg?.winRate || 0) * 100)}%) su tutte le sieges osservate. Controlla comunque rune/artefatti/strategia.`,
      warning: "",
      video: null,
      images: [],
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
  // coppie con winRate >= 50% arrivano a diventare proposal comunque.
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
