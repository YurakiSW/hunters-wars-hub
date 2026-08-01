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

export async function listGuildDefenses(searchQuery) {
  const included = await includedSiegeKeys();
  const keys = await redis.smembers(DEFENSE_INDEX_KEY);
  if (!keys.length) return [];
  const out = [];
  for (const dK of keys) {
    const battles = await loadBattlesForDefense(dK, included);
    if (!battles.length) continue;
    const latest = battles.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
    if (searchQuery && !normalizeMonsterName(latest.ownerNick).includes(normalizeMonsterName(searchQuery))) continue;
    const wins = battles.filter((b) => b.won).length;
    out.push({
      defenseKey: dK,
      ownerNick: latest.ownerNick,
      monsterNames: latest.unitNames,
      total: battles.length,
      wins,
      losses: battles.length - wins,
      winRate: wins / battles.length,
    });
  }
  return out.sort((a, b) => a.winRate - b.winRate || b.total - a.total);
}

export async function getGuildDefenseDetail(defenseKey) {
  const included = await includedSiegeKeys();
  const battles = await loadBattlesForDefense(defenseKey, included);
  if (!battles.length) return null;
  const latest = battles.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];

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
