import { redis } from "./redis";
import { normalizeMonsterName, canonicalMonsterName } from "./textUtils";
import { getFullMonsterList, getCanonicalNameMap } from "./monsters";

// --- Nome gilda ------------------------------------------------------------
// Configurabile (non scritto fisso nel codice): serve solo a scartare le
// righe che non riguardano la gilda giusta, non è usato per capire i ruoli
// (quello lo dice già il campo `guild_id`/`opp_guild_id` del comando).
const GUILD_NAME_KEY = "siegeDef:guildName";
const DEFAULT_GUILD_NAME = "Hunters Wars";

export async function getGuildName() {
  return (await redis.get(GUILD_NAME_KEY)) || DEFAULT_GUILD_NAME;
}

export async function setGuildName(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("Il nome gilda non può essere vuoto.");
  await redis.set(GUILD_NAME_KEY, trimmed);
  return trimmed;
}

// --- Chiavi Redis ------------------------------------------------------------
// Stesso principio già validato stanotte sui counter: MAI un contatore
// mantenuto a mano. Ogni battaglia si salva come record a sé; le
// percentuali si calcolano sempre leggendo i record al volo, filtrati per
// le sole siege "incluse" al momento — mai per somma/sottrazione
// incrementale, che è esattamente la classe di bug che ci ha fatto
// scoprire il conteggio doppio di stanotte.
const SIEGE_INDEX_KEY = "siegeDef:sieges:index"; // SET di siegeKey
const siegeKeyOf = (siegeId, matchId) => `${siegeId}:${matchId}`;
const siegeRecordKey = (siegeKey) => `siegeDef:siege:${siegeKey}`;
const DEFENSE_INDEX_KEY = "siegeDef:defenses:index"; // SET di defenseKey
const battlesByDefenseKey = (defenseKey) => `siegeDef:battles:byDefense:${defenseKey}`;
const battlesBySiegeKey = (siegeKey) => `siegeDef:battles:bySiege:${siegeKey}`;
const battleRecordKey = (battleId) => `siegeDef:battle:${battleId}`;
const SEEN_KEY = "siegeDef:seenLogIds"; // log_id del gioco: univoco per riga, deduplica perfetta

// Identità di una difesa: proprietario + i 3 mostri (canonicalizzati per le
// coppie collab/normale) — stesso principio già in uso per i counter, mai
// solo la specie da sola.
function buildDefenseKey(ownerNick, monsterNames) {
  const sorted = [...monsterNames].map(normalizeMonsterName).sort();
  return `${normalizeMonsterName(ownerNick)}::${sorted.join("|")}`;
}

// Estrae SOLO le righe di log_type:2 (la nostra gilda in difesa) dal
// comando giusto — GetGuildSiegeBattleLog, guild-wide, NON
// GetGuildSiegeBattleLogByWizardId (che è il comando dell'attacco, per
// singolo membro, e contiene per intero il nome del primo come
// sottostringa: bisogna cercare il nome ESATTO del comando, non un prefisso).
function extractDefenseRows(rawLogText, guildName) {
  const rows = [];
  let idx = 0;
  while (true) {
    // Ancorato al command JSON esatto, non a una sottostringa del nome:
    // così non si prende mai per sbaglio GetGuildSiegeBattleLogByWizardId.
    idx = rawLogText.indexOf('"command":"GetGuildSiegeBattleLog"', idx);
    if (idx === -1) break;
    const respIdx = rawLogText.indexOf("Response:", idx);
    if (respIdx === -1) { idx += 30; continue; }
    const start = rawLogText.indexOf("{", respIdx);
    let depth = 0, end = null;
    for (let i = start; i < rawLogText.length; i++) {
      if (rawLogText[i] === "{") depth++;
      else if (rawLogText[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    idx = end || idx + 30;
    if (!end) continue;
    let data;
    try { data = JSON.parse(rawLogText.slice(start, end)); } catch { continue; }
    if (data.command !== "GetGuildSiegeBattleLog") continue;

    for (const logGroup of data.log_list || []) {
      for (const b of logGroup.battle_log_list || []) {
        if (b.log_type !== 2) continue; // solo difesa: guild_id = noi, opp_guild = chi attacca
        if (b.guild_name !== guildName) continue;
        const unitIds = b.view_battle_deck_info?.["1"] || [];
        if (unitIds.length !== 3) continue; // riga incompleta/malformata, si scarta
        rows.push({
          logId: b.log_id, // univoco per riga secondo il gioco: chiave di deduplica perfetta
          siegeId: b.siege_id,
          matchId: b.match_id,
          timestamp: b.log_timestamp,
          ownerNick: b.wizard_name,
          unitIds,
          won: b.win_lose === 1,
          enemyGuild: b.opp_guild_name,
          enemyWizardName: b.opp_wizard_name,
          baseNumber: b.base_number,
        });
      }
    }
  }
  return rows;
}

export async function importSiegeDefenseLog(rawLogText) {
  const guildName = await getGuildName();
  const rawRows = extractDefenseRows(rawLogText, guildName);
  if (!rawRows.length) return { imported: 0, skippedDuplicate: 0, sieges: [] };

  const [monsterList, canonicalMap] = await Promise.all([getFullMonsterList(), getCanonicalNameMap()]);
  const nameByComId = new Map();
  for (const m of monsterList) if (m.com2usId) nameByComId.set(m.com2usId, m.name);
  const resolveName = (id) => canonicalMonsterName(nameByComId.get(id) || `Sconosciuto (ID ${id})`, canonicalMap);

  // Deduplica per log_id: è un identificativo univoco assegnato dal gioco
  // a ogni riga, molto più affidabile di una chiave costruita a mano.
  const seen = new Set(await redis.smembers(SEEN_KEY));
  const toStore = rawRows.filter((r) => !seen.has(String(r.logId)));
  const skippedDuplicate = rawRows.length - toStore.length;
  if (!toStore.length) return { imported: 0, skippedDuplicate, sieges: [] };

  const pipeline = redis.pipeline();
  const touchedSieges = new Map(); // siegeKey -> { siegeId, matchId, enemyGuilds:Set, dateFrom, dateTo, battleCount }
  const touchedDefenses = new Set();

  for (const r of toStore) {
    const siegeKey = siegeKeyOf(r.siegeId, r.matchId);
    const s = touchedSieges.get(siegeKey) || {
      siegeId: r.siegeId, matchId: r.matchId, enemyGuilds: new Set(), dateFrom: null, dateTo: null, battleCount: 0,
    };
    s.enemyGuilds.add(r.enemyGuild);
    s.battleCount++;
    if (r.timestamp) {
      s.dateFrom = s.dateFrom ? Math.min(s.dateFrom, r.timestamp) : r.timestamp;
      s.dateTo = s.dateTo ? Math.max(s.dateTo, r.timestamp) : r.timestamp;
    }
    touchedSieges.set(siegeKey, s);

    const unitNames = r.unitIds.map(resolveName);
    const defKey = buildDefenseKey(r.ownerNick, unitNames);
    touchedDefenses.add(defKey);

    const battleId = `sdb_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    pipeline.set(battleRecordKey(battleId), {
      id: battleId,
      siegeKey,
      defenseKey: defKey,
      ownerNick: r.ownerNick,
      unitNames,
      won: r.won,
      enemyGuild: r.enemyGuild,
      enemyWizardName: r.enemyWizardName,
      timestamp: r.timestamp,
      baseNumber: r.baseNumber,
    });
    pipeline.sadd(battlesByDefenseKey(defKey), battleId);
    pipeline.sadd(battlesBySiegeKey(siegeKey), battleId);
  }

  pipeline.sadd(DEFENSE_INDEX_KEY, ...touchedDefenses);
  pipeline.sadd(SEEN_KEY, ...toStore.map((r) => String(r.logId)));

  // Le siege NUOVE nascono ESCLUSE dal conteggio: le si include a mano.
  // Se una siege esiste già (reimport parziale), si aggiornano solo i
  // metadati (conteggio/date), MAI lo stato "included" scelto dall'utente.
  const existingSiegeRecords = await Promise.all(
    [...touchedSieges.keys()].map((k) => redis.get(siegeRecordKey(k)))
  );
  let i = 0;
  for (const [siegeKey, s] of touchedSieges) {
    const existing = existingSiegeRecords[i++];
    const record = {
      siegeKey,
      siegeId: s.siegeId,
      matchId: s.matchId,
      enemyGuilds: [...new Set([...(existing?.enemyGuilds || []), ...s.enemyGuilds])],
      dateFrom: existing?.dateFrom ? Math.min(existing.dateFrom, s.dateFrom ?? Infinity) : s.dateFrom,
      dateTo: existing?.dateTo ? Math.max(existing.dateTo, s.dateTo ?? -Infinity) : s.dateTo,
      battleCount: (existing?.battleCount || 0) + s.battleCount,
      included: existing?.included ?? false, // MAI sovrascritto se già esisteva
    };
    pipeline.set(siegeRecordKey(siegeKey), record);
    pipeline.sadd(SIEGE_INDEX_KEY, siegeKey);
  }
  await pipeline.exec();

  return { imported: toStore.length, skippedDuplicate, sieges: [...touchedSieges.keys()] };
}

export async function listSieges() {
  const keys = await redis.smembers(SIEGE_INDEX_KEY);
  if (!keys.length) return [];
  const records = (await Promise.all(keys.map((k) => redis.get(siegeRecordKey(k))))).filter(Boolean);
  return records.sort((a, b) => (b.dateFrom || 0) - (a.dateFrom || 0));
}

export async function setSiegeIncluded(siegeKey, included) {
  const record = await redis.get(siegeRecordKey(siegeKey));
  if (!record) throw new Error("Siege non trovata.");
  record.included = !!included;
  await redis.set(siegeRecordKey(siegeKey), record);
  return record;
}

// Cancella una siege per intero: toglie tutti i suoi record di battaglia
// (dagli indici per-difesa e per-siege) e il record della siege stessa.
// Le difese rimaste senza nessuna battaglia escono dall'indice pubblico.
export async function deleteSiege(siegeKey) {
  const battleIds = await redis.smembers(battlesBySiegeKey(siegeKey));
  if (battleIds.length) {
    const records = await Promise.all(battleIds.map((id) => redis.get(battleRecordKey(id))));
    const pipeline = redis.pipeline();
    const touchedDefenseKeys = new Set();
    for (let i = 0; i < battleIds.length; i++) {
      pipeline.del(battleRecordKey(battleIds[i]));
      if (records[i]?.defenseKey) {
        pipeline.srem(battlesByDefenseKey(records[i].defenseKey), battleIds[i]);
        touchedDefenseKeys.add(records[i].defenseKey);
      }
    }
    await pipeline.exec();
    for (const dK of touchedDefenseKeys) {
      const remaining = await redis.scard(battlesByDefenseKey(dK));
      if (!remaining) {
        await redis.srem(DEFENSE_INDEX_KEY, dK);
        await redis.del(battlesByDefenseKey(dK));
      }
    }
  }
  await redis.del(battlesBySiegeKey(siegeKey));
  await redis.del(siegeRecordKey(siegeKey));
  await redis.srem(SIEGE_INDEX_KEY, siegeKey);
  return { deletedBattles: battleIds.length };
}

// --- Lettura per la pagina pubblica -----------------------------------------

async function includedSiegeKeys() {
  const sieges = await listSieges();
  return new Set(sieges.filter((s) => s.included).map((s) => s.siegeKey));
}

async function loadBattlesForDefense(defenseKey, included) {
  const ids = await redis.smembers(battlesByDefenseKey(defenseKey));
  if (!ids.length) return [];
  const battles = (await Promise.all(ids.map((id) => redis.get(battleRecordKey(id))))).filter(Boolean);
  return battles.filter((b) => included.has(b.siegeKey));
}

// Riepilogo di una difesa a partire dalle sue battaglie già filtrate:
// vittorie/sconfitte totali + lo stamp per gilda nemica. Usata sia per il
// dettaglio di una singola difesa sia per l'archiviazione (dove serve per
// OGNI difesa in un colpo solo) — prima era la stessa logica ripetuta due
// volte, con un rischio concreto che le due copie divergessero nel tempo.
function summarizeDefenseBattles(defenseKey, battles) {
  const latest = battles.reduce((a, b) => ((b.timestamp || 0) > (a.timestamp || 0) ? b : a));
  const byGuild = new Map();
  for (const b of battles) {
    const g = byGuild.get(b.enemyGuild) || { guild: b.enemyGuild, wins: 0, losses: 0 };
    if (b.won) g.wins++; else g.losses++;
    byGuild.set(b.enemyGuild, g);
  }
  const wins = battles.filter((b) => b.won).length;
  return {
    defenseKey,
    ownerNick: latest.ownerNick,
    monsterNames: latest.unitNames,
    total: battles.length,
    wins,
    losses: battles.length - wins,
    winRate: wins / battles.length,
    enemyGuilds: [...byGuild.values()].sort((a, b) => b.losses - a.losses || b.wins - a.wins),
  };
}

export async function listGuildDefenses(searchQuery) {
  const included = await includedSiegeKeys();
  const keys = await redis.smembers(DEFENSE_INDEX_KEY);
  if (!keys.length) return [];
  const out = [];
  for (const dK of keys) {
    const battles = await loadBattlesForDefense(dK, included);
    if (!battles.length) continue;
    const summary = summarizeDefenseBattles(dK, battles);
    if (searchQuery && !normalizeMonsterName(summary.ownerNick).includes(normalizeMonsterName(searchQuery))) continue;
    // Nella lista non serve lo stamp per gilda (solo nel dettaglio, quando
    // si espande una difesa) — tolto qui per non mandarlo in giro inutilmente.
    const { enemyGuilds, ...rest } = summary;
    out.push(rest);
  }
  return out.sort((a, b) => a.winRate - b.winRate || b.total - a.total);
}

export async function getGuildDefenseDetail(defenseKey) {
  const included = await includedSiegeKeys();
  const battles = await loadBattlesForDefense(defenseKey, included);
  if (!battles.length) return null;
  return summarizeDefenseBattles(defenseKey, battles);
}

// --- Vista unificata per TEAM -----------------------------------------------
// Il defenseKey è "proprietario::mostri" — il "team" è tutto quello che
// viene dopo "::", quindi si può ricavare senza un indice a parte,
// semplicemente raggruppando i defenseKey già esistenti che condividono
// la stessa terna di mostri, a prescindere da chi la usa.
function teamKeyFromDefenseKey(defenseKey) {
  const idx = defenseKey.indexOf("::");
  return idx === -1 ? defenseKey : defenseKey.slice(idx + 2);
}

// Elenco unificato per team: un team = TUTTI i nostri giocatori che lo usano
// come difesa, sommati insieme. È la vista di default della pagina (nessuna
// ricerca attiva) — vittorie/sconfitte "universali" per quella terna di
// mostri, su tutte le siege incluse, a prescindere da chi la gioca.
export async function listGuildDefensesByTeam() {
  const included = await includedSiegeKeys();
  const keys = await redis.smembers(DEFENSE_INDEX_KEY);
  if (!keys.length) return [];
  const byTeam = new Map(); // teamKey -> { monsterNames, battles: [] }
  for (const dK of keys) {
    const battles = await loadBattlesForDefense(dK, included);
    if (!battles.length) continue;
    const teamKey = teamKeyFromDefenseKey(dK);
    const t = byTeam.get(teamKey) || { teamKey, monsterNames: battles[0].unitNames, battles: [], owners: new Set() };
    t.battles.push(...battles);
    t.owners.add(battles[0].ownerNick);
    byTeam.set(teamKey, t);
  }
  const out = [];
  for (const t of byTeam.values()) {
    const wins = t.battles.filter((b) => b.won).length;
    out.push({
      teamKey: t.teamKey,
      monsterNames: t.monsterNames,
      total: t.battles.length,
      wins,
      losses: t.battles.length - wins,
      winRate: wins / t.battles.length,
      playerCount: t.owners.size,
    });
  }
  return out.sort((a, b) => a.winRate - b.winRate || b.total - a.total);
}

// Ricerca per team: stessa lista di sopra, filtrata sui team che contengono
// (anche solo parzialmente) il mostro cercato.
export async function searchGuildDefenseTeams(monsterQuery) {
  const teams = await listGuildDefensesByTeam();
  if (!monsterQuery) return teams;
  const q = normalizeMonsterName(monsterQuery);
  return teams.filter((t) => t.monsterNames.some((n) => normalizeMonsterName(n).includes(q)));
}

// Dettaglio di un team aperto: tutti i NOSTRI giocatori che lo usano, ognuno
// con le proprie vittorie/sconfitte e lo stamp per gilda nemica — riusa
// summarizeDefenseBattles per ogni giocatore, stessa identica logica del
// dettaglio di una singola difesa, solo ripetuta per ciascuno.
export async function getTeamDetail(teamKey) {
  const included = await includedSiegeKeys();
  const keys = await redis.smembers(DEFENSE_INDEX_KEY);
  const matchingKeys = keys.filter((dK) => teamKeyFromDefenseKey(dK) === teamKey);
  if (!matchingKeys.length) return null;

  const players = [];
  for (const dK of matchingKeys) {
    const battles = await loadBattlesForDefense(dK, included);
    if (!battles.length) continue;
    players.push(summarizeDefenseBattles(dK, battles));
  }
  if (!players.length) return null;
  players.sort((a, b) => a.winRate - b.winRate || b.total - a.total);

  const totalBattles = players.reduce((s, p) => s + p.total, 0);
  const totalWins = players.reduce((s, p) => s + p.wins, 0);
  return {
    teamKey,
    monsterNames: players[0].monsterNames,
    total: totalBattles,
    wins: totalWins,
    losses: totalBattles - totalWins,
    winRate: totalWins / totalBattles,
    players,
  };
}

// --- Archivio stagione -------------------------------------------------------
// "Archiviare" NON sposta dati e non li ricalcola più avanti: congela
// esattamente il risultato di ORA (con le siege spuntate in questo
// momento) dentro un fermo immagine a sé, poi svuota il live per la
// stagione nuova. L'archivio è quindi sempre sola lettura — niente spunte
// da ritoccare dentro, per scelta: era la parte complicata che abbiamo
// deciso di NON costruire, in cambio di molta meno superficie per bug.
const ARCHIVE_INDEX_KEY = "siegeDef:archive:index"; // SET di archiveId
const archiveRecordKey = (archiveId) => `siegeDef:archive:${archiveId}`;

const ITALIAN_MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
function monthYearLabel(timestampSeconds) {
  const d = new Date(timestampSeconds * 1000);
  return `${ITALIAN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export async function archiveCurrentSeason() {
  const sieges = await listSieges();
  const includedSieges = sieges.filter((s) => s.included);
  if (!includedSieges.length) {
    throw new Error("Nessuna siege inclusa: non c'è niente da archiviare.");
  }

  // Costruisco il fermo immagine completo — build + stamp per gilda per
  // OGNI difesa, calcolato ORA sulle sole siege incluse in questo
  // momento. Da qui in poi questi numeri non cambiano mai più.
  const included = new Set(includedSieges.map((s) => s.siegeKey));
  const defenseKeys = await redis.smembers(DEFENSE_INDEX_KEY);
  const defenses = [];
  for (const dK of defenseKeys) {
    const battles = await loadBattlesForDefense(dK, included);
    if (!battles.length) continue;
    defenses.push(summarizeDefenseBattles(dK, battles));
  }
  defenses.sort((a, b) => a.winRate - b.winRate || b.total - a.total);

  const dateFrom = Math.min(...includedSieges.map((s) => s.dateFrom).filter(Boolean));
  const dateTo = Math.max(...includedSieges.map((s) => s.dateTo).filter(Boolean));
  const label = dateFrom === dateTo || monthYearLabel(dateFrom) === monthYearLabel(dateTo)
    ? `SEASON ${monthYearLabel(dateFrom)}`
    : `SEASON ${monthYearLabel(dateFrom)} - ${monthYearLabel(dateTo)}`;

  const archiveId = `season_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const archive = {
    archiveId,
    label,
    archivedAt: Date.now(),
    dateFrom,
    dateTo,
    siegeCount: includedSieges.length,
    enemyGuilds: [...new Set(includedSieges.flatMap((s) => s.enemyGuilds))],
    defenses,
  };
  await redis.set(archiveRecordKey(archiveId), archive);
  await redis.sadd(ARCHIVE_INDEX_KEY, archiveId);

  // Svuoto tutto il live per la stagione nuova. Scansione DIRETTA delle
  // chiavi coi prefissi giusti (redis.keys), non solo tramite gli indici —
  // stessa cautela già presa per l'archivio dei counter, dopo aver scoperto
  // che un indice può avere buchi e lasciare dati orfani per sempre.
  const [siegeKeysFound, battleKeysFound, byDefenseKeysFound, bySiegeKeysFound] = await Promise.all([
    redis.keys("siegeDef:siege:*"),
    redis.keys("siegeDef:battle:*"),
    redis.keys("siegeDef:battles:byDefense:*"),
    redis.keys("siegeDef:battles:bySiege:*"),
  ]);
  const allKeysToDelete = [...siegeKeysFound, ...battleKeysFound, ...byDefenseKeysFound, ...bySiegeKeysFound];
  if (allKeysToDelete.length) {
    const pipeline = redis.pipeline();
    for (const k of allKeysToDelete) pipeline.del(k);
    await pipeline.exec();
  }
  await redis.del(SIEGE_INDEX_KEY);
  await redis.del(DEFENSE_INDEX_KEY);
  await redis.del(SEEN_KEY);

  return { archiveId, label, defenseCount: defenses.length, siegeCount: includedSieges.length };
}

export async function listSeasonArchives() {
  const ids = await redis.smembers(ARCHIVE_INDEX_KEY);
  if (!ids.length) return [];
  const archives = (await Promise.all(ids.map((id) => redis.get(archiveRecordKey(id))))).filter(Boolean);
  return archives
    .map(({ defenses, ...meta }) => ({ ...meta, defenseCount: defenses.length }))
    .sort((a, b) => (b.dateTo || 0) - (a.dateTo || 0));
}

export async function getSeasonArchive(archiveId) {
  return (await redis.get(archiveRecordKey(archiveId))) || null;
}

export async function deleteSeasonArchive(archiveId) {
  await redis.del(archiveRecordKey(archiveId));
  await redis.srem(ARCHIVE_INDEX_KEY, archiveId);
}

// Svuota TUTTO l'archivio in un colpo — tutte le stagioni, non solo una.
export async function deleteAllSeasonArchives() {
  const ids = await redis.smembers(ARCHIVE_INDEX_KEY);
  if (!ids.length) return { deleted: 0 };
  const pipeline = redis.pipeline();
  for (const id of ids) pipeline.del(archiveRecordKey(id));
  await pipeline.exec();
  await redis.del(ARCHIVE_INDEX_KEY);
  return { deleted: ids.length };
}
