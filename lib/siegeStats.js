import { redis } from "./redis";
import { orderedTeamKey, defenseKey } from "./siegeLogParser";
import { createDef, createCounter, listDefs, deleteCounter, updateCounter, getCounter, counterHasBuildInfo } from "./defs";
import { normalizeMonsterName } from "./textUtils";
import { describeRuneSets, describeRuneMainStats, computeCombatStats, teamRuneEfficiency, computeTeamBonusPct } from "./runeSets";
import { describeUnitArtifacts } from "./artifactEffects";
import { describeUnitRelic } from "./relicEffects";
import { getMonsterBaseStatsByName, getCanonicalNameMap } from "./monsters";
import { canonicalMonsterName } from "./textUtils";

// Decodifica SEMPRE al volo da dati grezzi (rawRunes/rawArtifacts), non da
// un testo salvato in passato — così se aggiungiamo nuovi codici artefatto,
// le build già in coda (pending/approved) si aggiornano da sole appena le
// guardi, senza dover ricaricare lo stesso log. Le poche variant salvate
// PRIMA di questo cambiamento (solo testo, niente dati grezzi) restano
// mostrate come erano allora — nessun dato grezzo da cui rigenerarle.
function decodeUnitsForDisplay(units, baseStatsByName) {
  if (!units) return units;
  // Bonus validi per TUTTA la squadra (leader skill del leader + set gilda):
  // si calcolano una volta sola qui, non per singolo mostro. Il leader è
  // quello marcato `lead`; se manca si usa il primo, come da convenzione
  // del sito (14/08/2026, Flora).
  const leaderName = units.find((u) => u?.lead)?.name || units[0]?.name || null;
  const teamBonus = computeTeamBonusPct(units, leaderName, baseStatsByName, normalizeMonsterName);

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
      combatStats: u.combatStats || computeCombatStats(
        u.rawRunes, u.rawCombatBase, u.rawArtifacts, u.rawRelics,
        baseStatsByName?.get(normalizeMonsterName(u.name)),
        teamBonus,
      ),
      // Facoltativo: se manca (formato vecchio, o log senza relic) resta
      // null e il form/la card semplicemente non la mostrano — mai bloccante.
      relicMainStat: u.relicMainStat ?? describeUnitRelic(u.rawRelics),
    };
  });
}

// Ordina i nomi per SPD decrescente (chi agisce prima nel turno 1).
// IMPORTANTE: si usa la SPD COMBAT (base + torre 15% + rune/grind), non la
// SPD della scheda e tantomeno la SPD base del replay: le base sono quasi
// identiche tra mostri (96 / 100 / 102) e ordinarle dava un ordine
// completamente sbagliato. Il bonus torre non compare mai sulla scheda ma
// vale sempre in battaglia, quindi è l'unico numero che riflette il turno
// reale. Se manca la SPD anche per un solo mostro, non rischiamo un ordine
// parziale/sbagliato e lasciamo l'ordine originale (di solito leader-first).
function turnOrderBySpd(units, fallbackNames) {
  const spdOf = (u) => u?.combatStats?.spdCombat ?? u?.combatStats?.spd ?? u?.spd;
  if (!units?.every((u) => typeof spdOf(u) === "number" && spdOf(u) > 0)) return fallbackNames;
  return [...units].sort((a, b) => spdOf(b) - spdOf(a)).map((u) => u.name);
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
// Set separato per le catture dei replay ricchi (conteggio per-build): usa
// un'impronta diversa dal battleId (rand_seeds della battaglia), quindi non
// può stare nello stesso set senza rischiare collisioni.
const SEEN_CAPTURES_PREFIX = "siege_capture_seen";
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
// La build migliore È, per definizione, la prima della classifica di
// allVariants() — mai una selezione a parte, altrimenti i due possono
// divergere (vedi commento in allVariants sullo spareggio stabile).
async function bestVariant(defK, counterK) {
  const ranked = await allVariants(defK, counterK);
  if (ranked.length) return ranked[0];
  // Nessuna build con rune: si ripiega su quelle "vuote", se esistono, per
  // non perdere il conteggio di una coppia mai vista in un replay aperto.
  const hashes = await redis.smembers(variantIndexKey(defK, counterK));
  if (!hashes.length) return null;
  const variants = (await Promise.all(hashes.map((h) => redis.get(variantKey(defK, counterK, h))))).filter(Boolean);
  return variants.sort((a, b) => b.winRate - a.winRate || b.total - a.total)[0] || null;
}

// Come bestVariant ma restituisce TUTTE le build registrate per quella
// coppia, ordinate dalla più vincente alla meno — serve a mostrare il
// confronto in chiaro ("6/6 con la build di Lucioxis, 2/2 con quella di
// AdrE") invece di far fidare l'utente della scelta automatica.
// Aggiunta il 12/08/2026 (Flora). Solo le build con rune vere: quelle
// vuote non sono confrontabili e confonderebbero l'elenco.
async function allVariants(defK, counterK) {
  const hashes = await redis.smembers(variantIndexKey(defK, counterK));
  if (!hashes.length) return [];
  const variants = (await Promise.all(hashes.map((h) => redis.get(variantKey(defK, counterK, h))))).filter(Boolean);
  return variants
    .filter((v) => v.units)
    .map((v) => ({ ...v, teamEff: teamRuneEfficiency(v.units) }))
    // STESSO identico criterio di bestVariant() — se divergono, la stella in
    // UI finisce su una build mentre il sito ne usa un'altra.
    // A parità di vittorie e percentuale vince la squadra runata meglio
    // (idea di Flora, 14/08/2026): è un criterio che significa qualcosa,
    // al contrario dell'ordine alfabetico. Chi non ha rune leggibili finisce
    // dopo chi le ha, non prima. Il buildHash resta come ultimissimo
    // spareggio per garantire un risultato sempre identico a parità totale
    // (i set di Redis non hanno ordine garantito).
    .sort((a, b) =>
      b.winRate - a.winRate ||
      b.total - a.total ||
      (b.teamEff ?? -1) - (a.teamEff ?? -1) ||
      (a.buildHash || "").localeCompare(b.buildHash || "")
    );
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
  const canonicalMap = await getCanonicalNameMap();
  const canonNames = (names) => (names || []).map((n) => canonicalMonsterName(n, canonicalMap));
  const publishedByKey = new Map();
  for (const d of existingDefs) {
    // Anche qui i nomi vanno canonicalizzati: un counter pubblicato in
    // passato con il nome della versione collab deve agganciarsi alla stessa
    // coppia di uno nuovo giocato con la versione normale, altrimenti se ne
    // creerebbe un secondo identico.
    const dK = defenseKey(canonNames(d.monsters));
    for (const c of d.counters || []) {
      const off = canonNames(c.offense);
      publishedByKey.set(`${dK}::${orderedTeamKey(off)}`, { defId: d.id, counterId: c.id });
      publishedByKey.set(`${dK}::${legacyOrderedTeamKey(off)}`, { defId: d.id, counterId: c.id });
    }
  }

  const writePipeline = redis.pipeline();
  let touched = false;
  const newIndexEntries = [];

  // Un counter già pubblicato che mantiene/migliora il winrate O ha una
  // build più completa di quella salvata (rune/artefatti apparsi solo ora)
  // merita "Aggiornamento disponibile". Guardato SOLO sulle coppie di
  // QUESTO import (non su tutto il bestiario/tutti i counter del sito —
  // stesso principio già rispettato prima, resta un elenco piccolo e
  // proporzionato al log caricato).
  const buildUpgradeCandidates = pairs
    .map((p, i) => ({ p, existing: existingList[i] }))
    .filter(({ p, existing }) => {
      const agg = updatedAggByPair.get(`${p.defK}::${p.counterK}`);
      if (!agg || !existing) return false;
      const isPublished = existing.status === "approved" || existing.status === "update_available" || existing.status === "underperforming";
      return isPublished && agg.winRate >= PROPOSAL_THRESHOLD && !!existing.counterId;
    });
  const buildUpgradeResults = new Map(); // key -> true se è comparsa build dove non c'era
  // Corretto il 08/08/2026 (Flora): un winrate più alto NON deve mai poter
  // sostituire un counter già approvato che ha rune/build vere con una
  // variante nuova che invece non le ha — anche se "vince di più". Se
  // succederebbe questo scambio al ribasso, la proposal resta "approved"
  // così com'è, il counter buono non si tocca mai.
  const buildDowngradeGuard = new Map(); // key -> true se aggiornare perderebbe la build
  if (buildUpgradeCandidates.length) {
    const [bestVariants, approvedCounters] = await Promise.all([
      Promise.all(buildUpgradeCandidates.map(({ p }) => bestVariant(p.defK, p.counterK))),
      Promise.all(buildUpgradeCandidates.map(({ existing }) => getCounter(existing.counterId))),
    ]);
    buildUpgradeCandidates.forEach(({ p }, i) => {
      const newHasBuild = bestVariants[i]?.units != null;
      const approvedHasBuild = approvedCounters[i] ? counterHasBuildInfo(approvedCounters[i]) : false;
      if (newHasBuild && !approvedHasBuild) {
        buildUpgradeResults.set(`${p.defK}::${p.counterK}`, true);
      }
      if (!newHasBuild && approvedHasBuild) {
        buildDowngradeGuard.set(`${p.defK}::${p.counterK}`, true);
      }
    });
  }

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
      const key = `${p.defK}::${p.counterK}`;
      if (agg.winRate < PROPOSAL_THRESHOLD) {
        existing.status = "underperforming";
      } else if (buildDowngradeGuard.get(key)) {
        // Winrate magari anche migliorato, ma la nuova variante non ha
        // build mentre quella approvata sì — non si scambia mai dati
        // completi con dati più poveri solo per un winrate più alto.
        existing.status = "approved";
      } else if (existing.approvedWinRate != null && agg.winRate > existing.approvedWinRate) {
        existing.status = "update_available";
      } else if (buildUpgradeResults.get(key)) {
        // Winrate uguale/comunque sopra soglia, ma è comparsa una build
        // (rune/artefatti) che il counter approvato ancora non ha.
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
  //
  // ATTENZIONE: lo stesso battleId compare più volte NELLO STESSO log (SWEX
  // registra la stessa battaglia da più chiamate API: 2 o 3 copie a testa).
  // Senza `countedInThisBatch` ogni battaglia veniva contata una volta per
  // copia; e siccome le copie non sono uniformi, il win rate usciva distorto
  // — caso reale: 4 vittorie su 6 (67%) diventavano 8 su 13 (62%), perché
  // una sconfitta era presente in triplice copia.
  const countedInThisBatch = new Set();
  const toRecord = matchups.filter((m) => {
    if (!m.battleId) return true;
    if (!newBattleIdSet.has(m.battleId)) return false;
    if (countedInThisBatch.has(m.battleId)) return false;
    countedInThisBatch.add(m.battleId);
    return true;
  });
  // NOTA (12/08/2026, Flora): qui NON si esce più in anticipo quando non ci
  // sono battaglie nuove. Capita spesso di reimportare lo stesso log dopo
  // aver aperto altri replay in gioco: le battaglie risultano già viste, ma
  // le BUILD (rune vere) sono nuove e vanno registrate lo stesso. L'uscita
  // anticipata le buttava via. Il controllo "non c'è davvero niente da fare"
  // si fa più sotto, dopo aver contato anche le catture nuove.

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
  }

  // Corretto l'11/08/2026 (Flora): PRIMA questo ciclo prendeva "una" build a
  // caso (qualunque cosa richUnitsByOffenseDefenseKey avesse tenuto per
  // quella coppia) e ci appiccicava sopra TUTTE le vittorie/sconfitte della
  // coppia intera, comprese quelle di giocatori che avevano usato build
  // completamente diverse — chi "vinceva" il conteggio dipendeva solo
  // dall'ordine nel file, non da chi vinceva DAVVERO di più.
  //
  // Ora: ogni replay con le rune vere (= una vittoria confermata, vedi
  // extractRichReplayDetails) vota per la PROPRIA build specifica, +1
  // vittoria alla build ESATTA di quel giocatore — non a "una" build
  // scelta a caso per tutta la coppia. Il conteggio generale vittorie/
  // sconfitte della coppia (sopra, aggDelta — usato per decidere se un
  // counter supera la soglia del 90%) resta IDENTICO a prima, non tocca
  // questa parte per niente.
  // Corretto il 12/08/2026 (Flora): il conteggio per-build DEVE rispettare
  // la stessa deduplica del conteggio generale, altrimenti reimportare lo
  // stesso log gonfiava le vittorie delle build (il totale della coppia era
  // protetto dal battleId, questo no) e falsava quale build risulta
  // "migliore". Ogni cattura porta ora un captureId univoco (rand_seeds
  // della battaglia + wizard_id, vedi extractRichReplayDetails): quelli già
  // visti in un import precedente vengono saltati.
  const allCaptures = [];
  for (const [key, captures] of richUnitsByOffenseDefenseKey || []) {
    for (const cap of captures) allCaptures.push({ key, cap });
  }
  const captureIds = allCaptures.map(({ cap }) => cap.captureId).filter(Boolean);
  const seenCaptures = captureIds.length ? new Set(await redis.smembers(SEEN_CAPTURES_PREFIX)) : new Set();
  const newCaptureIds = captureIds.filter((id) => !seenCaptures.has(id));
  if (newCaptureIds.length) await redis.sadd(SEEN_CAPTURES_PREFIX, ...newCaptureIds);
  const newCaptureIdSet = new Set(newCaptureIds);

  for (const { key, cap } of allCaptures) {
    // Le rare catture senza captureId (formato inatteso) si contano
    // comunque: meglio una in più che perdere una build vera.
    if (cap.captureId && !newCaptureIdSet.has(cap.captureId)) continue;
    const [counterK, defK] = key.split("::");
    const pairKey = `${defK}::${counterK}`;
    const buildHash = buildHashFromUnits(cap.units);
    const vKeyStr = `${pairKey}::${buildHash}`;
    const v = variantDelta.get(vKeyStr) || { defK, counterK, buildHash, wins: 0, total: 0, units: cap.units, ownerNick: cap.ownerNick };
    v.total++;
    v.wins++; // ogni cattura di replay è per definizione una vittoria (vedi extractRichReplayDetails)
    variantDelta.set(vKeyStr, v);
  }

  // Ora sì: se non c'è NULLA di nuovo (né battaglie né build), si esce
  // senza scrivere niente su Redis.
  if (!aggDelta.size && !variantDelta.size) return { newBattles: 0, touchedPairs: 0 };

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
    const updated = {
      wins: current.wins + v.wins,
      total: current.total + v.total,
      units: v.units || current.units || null,
      // Nick di chi ha giocato questa build: si conserva quello già noto se
      // il lotto nuovo non ce l'ha (log vecchi senza il campo).
      ownerNick: v.ownerNick || current.ownerNick || null,
      // Salvato il 12/08/2026 (Flora): serve a distinguere QUALE build è la
      // migliore nel confronto in UI. Senza, tutte le voci risultavano
      // "undefined === undefined" e comparivano tutte come vincenti (stella
      // e sfondo oro su ognuna).
      buildHash: v.buildHash,
    };
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
  // La mappa dell'accuracy base si legge UNA volta sola per tutta la lista.
  const baseStatsByName = await getMonsterBaseStatsByName();
  return Promise.all(
    filtered.map(async (p) => {
      // UNA sola lettura e UNA sola classifica (12/08/2026, Flora): prima
      // bestVariant() e allVariants() leggevano l'elenco da Redis con due
      // chiamate separate. I set di Redis non garantiscono l'ordine, quindi
      // a parità perfetta (es. due build entrambe 2/2) le due chiamate
      // potevano restituirle in ordine diverso e ognuna eleggeva una
      // vincitrice diversa — in UI si vedeva la stella su una build e
      // "giocata da" con il nome dell'altra. Ora la migliore È per
      // definizione la prima dell'unico elenco ordinato.
      const variants = await allVariants(p.defK, p.counterK);
      const best = variants[0] ? { ...variants[0] } : null;
      if (best) best.units = decodeUnitsForDisplay(best.units, baseStatsByName);
      // Riepilogo leggero per il confronto in UI: solo chi/quante vittorie,
      // NON le rune complete di ognuna (sarebbero decine di oggetti per
      // proposal, inutili finché non le si guarda davvero).
      // `isBest` si basa sulla posizione in classifica invece che sul
      // buildHash: le varianti salvate prima del 12/08/2026 non hanno quel
      // campo, e confrontare due undefined faceva risultare TUTTE migliori.
      const variantSummary = variants.map((v, i) => ({
        ownerNick: v.ownerNick || null,
        wins: v.wins,
        total: v.total,
        buildHash: v.buildHash || `pos${i}`,
        teamEff: v.teamEff != null ? Math.round(v.teamEff) : null,
        isBest: i === 0,
      }));
      return { ...p, bestVariant: best, variantSummary };
    })
  );
}

// Solo il conteggio per stato, per i numeretti sui tab — niente bestVariant
// (la parte pesante di listProposals, non serve per un numero). Usa mget
// invece di tante Promise.all(get) separate, stesso principio già
// applicato altrove stanotte per le liste grandi.
export async function countProposalsByStatus() {
  const keys = await redis.smembers(PROPOSAL_INDEX_KEY);
  const counts = { pending: 0, update_available: 0, underperforming: 0, approved: 0, rejected: 0 };
  if (!keys.length) return counts;
  const all = await redis.mget(...keys);
  for (const p of all) {
    if (p && counts[p.status] != null) counts[p.status]++;
  }
  return counts;
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
  const canonicalMap = await getCanonicalNameMap();
  const normKey = (names) =>
    [...names].map((n) => normalizeMonsterName(canonicalMonsterName(n, canonicalMap))).sort().join("|");
  let def = existingDefs.find((d) => normKey(d.monsters) === normKey(proposal.defenseNames));
  if (!def) {
    def = await createDef({
      monsters: proposal.defenseNames,
      desc: "Importata da Log Siege. Segnalare eventuali problemi.",
      authorId: approverId, authorNickname: "Siege Log",
      autoApprove: true,
    });
  }

  const units = overridePayload?.units || decodeUnitsForDisplay(best?.units, await getMonsterBaseStatsByName()) || proposal.offenseNames.map((name) => ({
    name, lead: false, runes: "", stats: "", statsFlexible: false, statsMinText: "",
    artifactLeft: [], artifactRight: [], notes: [""],
  }));
  const lead = overridePayload ? (units.slice(0, 3).find((u) => u.lead)?.name || units[0].name) : proposal.offenseNames[0];
  // Corretto il 14/08/2026 (Flora): con "Modifica e approva" le unità
  // arrivavano dal form COSÌ COM'ERANO, comprese le combat stats calcolate
  // col leader originale del log. Se si correggeva il leader (capita: la
  // squadra è giusta ma la lead era sbagliata) i numeri restavano quelli di
  // prima — leader skill inclusa — e anche l'ordine turni era falsato.
  // Il form non ha le rune grezze, quindi non può ricalcolare da solo: si
  // rifà qui, riabbinando per nome con la variante (i nomi non cambiano mai
  // in "Modifica e approva", solo il flag della lead).
  let finalUnits;
  let overrideTurnOrder = overridePayload?.turnOrder;
  if (overridePayload) {
    finalUnits = units;
    const rawByName = new Map((best?.units || []).map((u) => [normalizeMonsterName(u.name), u]));
    if (rawByName.size) {
      const baseStatsByName = await getMonsterBaseStatsByName();
      const unitsForBonus = units.map((u) => ({
        name: u.name,
        lead: u.lead,
        rawRunes: rawByName.get(normalizeMonsterName(u.name))?.rawRunes || null,
      }));
      const teamBonus = computeTeamBonusPct(unitsForBonus, lead, baseStatsByName, normalizeMonsterName);
      finalUnits = units.map((u) => {
        const raw = rawByName.get(normalizeMonsterName(u.name));
        if (!raw?.rawCombatBase) return u; // nessun dato grezzo: si lascia com'è
        return {
          ...u,
          combatStats: computeCombatStats(
            raw.rawRunes, raw.rawCombatBase, raw.rawArtifacts, raw.rawRelics,
            baseStatsByName.get(normalizeMonsterName(u.name)), teamBonus,
          ),
        };
      });
      // L'ordine turni si rifà SOLO se la persona non l'ha toccato a mano:
      // se coincide ancora con quello che il form aveva precompilato (col
      // leader vecchio), lo si rigenera col leader nuovo; se invece l'ha
      // riordinato di proposito, si rispetta la sua scelta.
      const precompilato = turnOrderBySpd(decodeUnitsForDisplay(best?.units, baseStatsByName), proposal.offenseNames);
      if (JSON.stringify(overrideTurnOrder) === JSON.stringify(precompilato)) {
        overrideTurnOrder = turnOrderBySpd(finalUnits, proposal.offenseNames);
      }
    }
  } else {
    // Approvazione diretta dal log: il leader lo sappiamo già con certezza,
    // basta segnare il flag sull'unità giusta senza toccare l'ordine array.
    finalUnits = units.map((u) => ({ ...u, lead: normalizeMonsterName(u.name) === normalizeMonsterName(lead) }));
  }

  // Se sto approvando "al volo" (senza passare da "Modifica e approva") e
  // manca la build vera (nessun replay completo l'ha mai catturata), il
  // Counter risultante resta "in attesa" come uno normale — serve
  // completarlo a mano prima che vada live, non basta il winRate a
  // renderlo pubblicabile senza rune/artefatti/strategia reali.
  const hasRealBuild = units.some((u) => u.runes || u.artifactLeft?.length || u.artifactRight?.length);
  const autoApprove = !!overridePayload || hasRealBuild;

  const counterData = {
    offense: overridePayload ? finalUnits.slice(0, 3).map((u) => u.name) : proposal.offenseNames,
    lead,
    turnOrder: overrideTurnOrder || turnOrderBySpd(finalUnits, proposal.offenseNames),
    units: finalUnits,
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
  // Nick di chi ha davvero giocato questa squadra nel log: mostrato accanto
  // a "Siege Log" per attribuire il counter alla persona giusta. Può
  // mancare sui dati importati prima che estraessimo questo campo — in quel
  // caso resta null e si mostra il solo "Siege Log".
  counterData.logOwnerNickname = best?.ownerNick || null;

  let counter;
  const existingCounter = proposal.counterId ? await getCounter(proposal.counterId) : null;
  // Se il counter era stato corretto a mano, un aggiornamento automatico dal
  // log NON deve cancellare la correzione: si aggiornano solo i dati di
  // contorno (nick del proprietario, stato) e si lasciano intatte le unità.
  const keepManualUnits = existingCounter?.manuallyEdited;
  if (keepManualUnits) delete counterData.units;
  if (existingCounter) {
    counter = await updateCounter(proposal.counterId, {
      ...counterData,
      // non sovrascrivere un nick già noto con un null
      logOwnerNickname: counterData.logOwnerNickname || existingCounter.logOwnerNickname || null,
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


// Ricalcola le COMBAT STATS di tutti i counter già pubblicati dal Siege Log.
//
// Perché serve (14/08/2026, Flora): le varianti non salvano le combat stats
// (si ricalcolano a ogni lettura, quindi si aggiornano da sole), ma i counter
// pubblicati sì — le hanno "congelate" al momento dell'approvazione. Dopo
// aver corretto bonus set, stat base per mostro e leader skill, quei numeri
// restavano quelli vecchi finché non arrivava un import nuovo per la stessa
// coppia. Questo strumento li rigenera tutti in un colpo.
//
// NON tocca i counter corretti a mano (`manuallyEdited`): quelli restano
// come li ha scritti la persona, stessa regola dell'aggiornamento automatico.
export async function recomputeApprovedCounterStats() {
  const keys = await redis.smembers(PROPOSAL_INDEX_KEY);
  const baseStatsByName = await getMonsterBaseStatsByName();
  let aggiornati = 0, saltatiManuali = 0, senzaDati = 0;

  // Elaborazione a GRUPPI PARALLELI (14/08/2026, Flora): farlo un counter
  // alla volta significava ~7 richieste a Redis in fila per ciascuno, e con
  // qualche centinaio di counter si superavano i 60 secondi massimi di
  // Vercel — la richiesta moriva senza risposta (nei log compariva "---"
  // invece del codice di stato). A gruppi di 12 il tempo si divide più o
  // meno per dodici. Il gruppo si sceglie piccolo apposta: alzarlo troppo
  // farebbe scattare i limiti di frequenza di Upstash.
  const GRUPPO = 12;
  for (let i = 0; i < keys.length; i += GRUPPO) {
    const fetta = keys.slice(i, i + GRUPPO);
    const esiti = await Promise.all(fetta.map(async (key) => {
      const proposal = await redis.get(key);
      if (!proposal?.counterId) return null;

      const [counter, best] = await Promise.all([
        getCounter(proposal.counterId),
        bestVariant(proposal.defK, proposal.counterK),
      ]);
      if (!counter) return null;
      if (counter.manuallyEdited) return "manuale";
      // Le unità decodificate non conservano le rune grezze: l'unica fonte
      // da cui rigenerare è la variante migliore della coppia.
      if (!best?.units) return "senzaDati";

      const decoded = decodeUnitsForDisplay(best.units, baseStatsByName);
      // Il flag `lead` si rimette dal counter: le varianti importate PRIMA
      // del 14/08/2026 non ce l'hanno (è stato aggiunto all'import solo
      // allora), quindi rigenerando le unità da lì il leader si perdeva e i
      // counter finivano in "Counter approvati senza leader segnato".
      const leadName = counter.lead || best.units.find((u) => u.lead)?.name || null;
      const units = leadName
        ? decoded.map((u) => ({ ...u, lead: normalizeMonsterName(u.name) === normalizeMonsterName(leadName) }))
        : decoded;
      await updateCounter(counter.id, {
        units,
        turnOrder: turnOrderBySpd(units, proposal.offenseNames),
      });
      return "ok";
    }));

    for (const e of esiti) {
      if (e === "ok") aggiornati++;
      else if (e === "manuale") saltatiManuali++;
      else if (e === "senzaDati") senzaDati++;
    }
  }
  return { aggiornati, saltatiManuali, senzaDati, totale: keys.length };
}
