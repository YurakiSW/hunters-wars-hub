import { redis } from "./redis";
import { normalizeMonsterName, canonicalMonsterName } from "./textUtils";
import { getFullMonsterList, getCanonicalNameMap, getBaseAccuracyByName } from "./monsters";
import { extractGuildDefenseBattles } from "./siegeLogParser";
import { decodeUnitsForDisplay } from "./siegeStats";

// decodeUnitsForDisplay si aspetta `lead` (non `isLeader`) e legge `rawSpd`
// a parte da rawCombatBase.spd — piccolo adattamento di formato, stessa
// funzione di decodifica usata per gli attacchi.
function toDecodable(units) {
  return units.map((u) => ({ ...u, lead: u.isLeader, rawSpd: u.rawCombatBase?.spd ?? null }));
}

// --- Nome gilda ----------------------------------------------------------
// Configurabile (non scritto fisso nel codice): se la gilda cambia nome un
// giorno, si cambia qui, non nei sorgenti.
const GUILD_NAME_KEY = "guildDefenses:guildName";
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

// --- Chiavi Redis ----------------------------------------------------------
// Design: ogni battaglia importata si salva come record a sé (mai numeri
// aggregati mantenuti a mano) — le statistiche si calcolano SEMPRE leggendo
// i record esistenti al volo. Cancellare un log = cancellare i suoi record:
// niente sottrazioni manuali, niente rischio di far divergere un contatore
// (esattamente il tipo di bug trovato stanotte sul conteggio delle vittorie).
const LOG_INDEX_KEY = "guildDefenses:logs:index"; // SET di logId
const logKey = (logId) => `guildDefenses:log:${logId}`;
const DEFENSE_INDEX_KEY = "guildDefenses:defenses:index"; // SET di defenseKey
const battlesByDefenseKey = (defenseKey) => `guildDefenses:battles:byDefense:${defenseKey}`; // SET di battleId
const battlesByLogKey = (logId) => `guildDefenses:battles:byLog:${logId}`; // SET di battleId
const battleKey = (battleId) => `guildDefenses:battle:${battleId}`;

// Identità di una difesa: proprietario + i 3 mostri (canonicalizzati, ordine
// ignorato tranne il leader) — MAI solo la specie, altrimenti persone
// diverse con la stessa combo finiscono mescolate (visto succedere davvero:
// stessa terna di mostri, tre proprietari diversi, build e risultati
// completamente diversi).
function buildDefenseKey(ownerNick, monsterNames, leaderName) {
  const rest = monsterNames.filter((n) => n !== leaderName).map(normalizeMonsterName).sort();
  return `${normalizeMonsterName(ownerNick)}::${normalizeMonsterName(leaderName)}|${rest.join("|")}`;
}

export async function importGuildDefenseLog(rawLogText, { importedByNickname, label }) {
  const guildName = await getGuildName();
  const rawBattles = extractGuildDefenseBattles(rawLogText, guildName);
  if (!rawBattles.length) {
    return { imported: 0, skippedDuplicate: 0, enemyGuilds: [], dateFrom: null, dateTo: null, logId: null };
  }

  const [monsterList, canonicalMap] = await Promise.all([getFullMonsterList(), getCanonicalNameMap()]);
  const nameByComId = new Map();
  for (const m of monsterList) if (m.com2usId) nameByComId.set(m.com2usId, m.name);
  const resolveName = (unitMasterId) => {
    const raw = nameByComId.get(unitMasterId);
    if (!raw) return `Sconosciuto (ID ${unitMasterId})`;
    return canonicalMonsterName(raw, canonicalMap);
  };

  // Deduplica GLOBALE (non solo dentro questo import): se lo stesso log, o
  // uno che si sovrappone, viene ricaricato, le battaglie già viste non si
  // contano una seconda volta.
  const existingKeys = new Set(await redis.smembers("guildDefenses:seenKeys"));
  const toStore = [];
  let skippedDuplicate = 0;
  for (const b of rawBattles) {
    if (existingKeys.has(b.dedupeKey)) { skippedDuplicate++; continue; }
    existingKeys.add(b.dedupeKey);
    toStore.push(b);
  }
  if (!toStore.length) {
    return { imported: 0, skippedDuplicate, enemyGuilds: [], dateFrom: null, dateTo: null, logId: null };
  }

  const logId = `gdlog_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const enemyGuilds = new Set();
  const timestamps = [];
  const pipeline = redis.pipeline();
  const battleIdsThisLog = [];
  const touchedDefenseKeys = new Set();

  for (const b of toStore) {
    enemyGuilds.add(b.enemyGuild);
    if (b.timestamp) timestamps.push(b.timestamp);

    const leaderUnit = b.ourUnits.find((u) => u.isLeader) || b.ourUnits[0];
    const ourNames = b.ourUnits.map((u) => resolveName(u.unitMasterId));
    const leaderName = resolveName(leaderUnit.unitMasterId);
    const defKey = buildDefenseKey(b.ownerNick, ourNames, leaderName);
    touchedDefenseKeys.add(defKey);

    const battleId = `gdb_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    battleIdsThisLog.push(battleId);

    const record = {
      id: battleId,
      logId,
      defenseKey: defKey,
      timestamp: b.timestamp,
      ownerNick: b.ownerNick,
      held: b.held,
      leaderName,
      ourUnits: b.ourUnits.map((u) => ({
        name: resolveName(u.unitMasterId),
        isLeader: u.isLeader,
        rawRunes: u.rawRunes,
        rawArtifacts: u.rawArtifacts,
        rawRelics: u.rawRelics,
        rawCombatBase: u.rawCombatBase,
      })),
      enemyGuild: b.enemyGuild,
      enemyWizardName: b.enemyWizardName,
      enemyLeaderName: resolveName((b.enemyUnits.find((u) => u.isLeader) || b.enemyUnits[0]).unitMasterId),
      enemyUnits: b.enemyUnits.map((u) => ({
        name: resolveName(u.unitMasterId),
        isLeader: u.isLeader,
        rawRunes: u.rawRunes,
        rawArtifacts: u.rawArtifacts,
        rawRelics: u.rawRelics,
        rawCombatBase: u.rawCombatBase,
      })),
    };
    pipeline.set(battleKey(battleId), record);
    pipeline.sadd(battlesByDefenseKey(defKey), battleId);
    pipeline.sadd(battlesByLogKey(logId), battleId);
  }
  pipeline.sadd(DEFENSE_INDEX_KEY, ...touchedDefenseKeys);
  pipeline.sadd("guildDefenses:seenKeys", ...toStore.map((b) => b.dedupeKey));

  const dateFrom = timestamps.length ? Math.min(...timestamps) : null;
  const dateTo = timestamps.length ? Math.max(...timestamps) : null;
  const logRecord = {
    id: logId,
    importedAt: Date.now(),
    importedByNickname,
    label: label || null,
    battleCount: toStore.length,
    enemyGuilds: [...enemyGuilds],
    dateFrom,
    dateTo,
  };
  pipeline.set(logKey(logId), logRecord);
  pipeline.sadd(LOG_INDEX_KEY, logId);
  await pipeline.exec();

  return { imported: toStore.length, skippedDuplicate, enemyGuilds: [...enemyGuilds], dateFrom, dateTo, logId };
}

export async function listGuildDefenseLogs() {
  const ids = await redis.smembers(LOG_INDEX_KEY);
  if (!ids.length) return [];
  const logs = (await Promise.all(ids.map((id) => redis.get(logKey(id))))).filter(Boolean);
  return logs.sort((a, b) => b.importedAt - a.importedAt);
}

// Cancella uno o più log Difese Gilda. Per ognuno: toglie i suoi record di
// battaglia (dagli indici per-difesa e per-log), poi il record del log
// stesso. Le difese rimaste senza battaglie escono dall'indice, così la
// pagina pubblica non mostra righe vuote. Le chiavi di deduplica NON si
// toccano: ricaricare lo stesso log dopo la cancellazione non farebbe
// ricomparire le battaglie (comportamento voluto, coerente con come
// funziona già Fine Season per il Siege Log offense).
export async function deleteGuildDefenseLogs(logIds) {
  let deletedBattles = 0;
  for (const logId of logIds) {
    const battleIds = await redis.smembers(battlesByLogKey(logId));
    if (battleIds.length) {
      const records = await Promise.all(battleIds.map((id) => redis.get(battleKey(id))));
      const pipeline = redis.pipeline();
      const touchedDefenseKeys = new Set();
      for (let i = 0; i < battleIds.length; i++) {
        pipeline.del(battleKey(battleIds[i]));
        if (records[i]?.defenseKey) {
          pipeline.srem(battlesByDefenseKey(records[i].defenseKey), battleIds[i]);
          touchedDefenseKeys.add(records[i].defenseKey);
        }
      }
      await pipeline.exec();
      deletedBattles += battleIds.length;
      // Se dopo la cancellazione una difesa non ha più nessuna battaglia,
      // la togliamo dall'indice pubblico.
      for (const dK of touchedDefenseKeys) {
        const remaining = await redis.scard(battlesByDefenseKey(dK));
        if (!remaining) await redis.srem(DEFENSE_INDEX_KEY, dK);
      }
    }
    await redis.del(battlesByLogKey(logId));
    await redis.del(logKey(logId));
    await redis.srem(LOG_INDEX_KEY, logId);
  }
  return { deletedLogs: logIds.length, deletedBattles };
}

// --- Lettura per la pagina pubblica ---------------------------------------

async function loadBattlesForDefense(defenseKey) {
  const ids = await redis.smembers(battlesByDefenseKey(defenseKey));
  if (!ids.length) return [];
  const battles = (await Promise.all(ids.map((id) => redis.get(battleKey(id))))).filter(Boolean);
  return battles.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

// Elenco leggero per la lista/ricerca: proprietario, mostri, record.
export async function listGuildDefenses(searchQuery) {
  const keys = await redis.smembers(DEFENSE_INDEX_KEY);
  if (!keys.length) return [];
  const out = [];
  for (const dK of keys) {
    const battles = await loadBattlesForDefense(dK);
    if (!battles.length) continue;
    const latest = battles[0]; // già ordinate per data decrescente
    const held = battles.filter((b) => b.held).length;
    if (searchQuery && !normalizeMonsterName(latest.ownerNick).includes(normalizeMonsterName(searchQuery))) continue;
    out.push({
      defenseKey: dK,
      ownerNick: latest.ownerNick,
      monsterNames: latest.ourUnits.map((u) => u.name),
      leaderName: latest.leaderName,
      total: battles.length,
      held,
      broken: battles.length - held,
      holdRate: held / battles.length,
      lastSeen: latest.timestamp,
    });
  }
  return out.sort((a, b) => a.holdRate - b.holdRate || b.total - a.total);
}

// Dettaglio completo di una difesa: build (dalla battaglia più recente,
// presumibilmente quella con le rune più aggiornate), record per gilda
// nemica, e l'albero Gilda -> Giocatore -> squadra usata contro di noi.
export async function getGuildDefenseDetail(defenseKey) {
  const battles = await loadBattlesForDefense(defenseKey);
  if (!battles.length) return null;
  const latest = battles[0];
  const baseAccuracyByName = await getBaseAccuracyByName();
  const decode = (units) => decodeUnitsForDisplay(toDecodable(units), baseAccuracyByName);

  const byGuild = new Map();
  for (const b of battles) {
    const g = byGuild.get(b.enemyGuild) || { guild: b.enemyGuild, held: 0, broken: 0, players: new Map() };
    if (b.held) g.held++; else g.broken++;
    const p = g.players.get(b.enemyWizardName) || { wizardName: b.enemyWizardName, held: 0, broken: 0, attempts: [] };
    if (b.held) p.held++; else p.broken++;
    p.attempts.push({
      timestamp: b.timestamp,
      held: b.held,
      leaderName: b.enemyLeaderName,
      units: decode(b.enemyUnits),
    });
    g.players.set(b.enemyWizardName, p);
    byGuild.set(b.enemyGuild, g);
  }
  const enemyGuilds = [...byGuild.values()]
    .map((g) => ({ ...g, players: [...g.players.values()].sort((a, b) => b.broken - a.broken) }))
    .sort((a, b) => b.broken - a.broken || b.held - a.held);

  const held = battles.filter((b) => b.held).length;
  return {
    defenseKey,
    ownerNick: latest.ownerNick,
    leaderName: latest.leaderName,
    ourUnits: decode(latest.ourUnits),
    total: battles.length,
    held,
    broken: battles.length - held,
    holdRate: held / battles.length,
    enemyGuilds,
  };
}
