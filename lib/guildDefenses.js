import { redis } from "./redis";
import { normalizeMonsterName, canonicalMonsterName } from "./textUtils";
import { getRoster, normalizeNickname } from "./roster";

// Punto UNICO da cui passano tutte le viste correnti (non l'archivio, che
// deve restare lo storico reale di quando la siege è stata giocata) — SOLO
// chi è ANCORA in gilda, secondo il JSON caricato via Admin (28/09/2026,
// Flora — MAI una deduzione automatica, sempre e solo quel file).
//
// L'identità vera è il `wizardId` (numero fisso dell'account), non il testo
// del nickname: chi cambia nome resta la stessa persona, e non serve nessun
// alias dichiarato a mano — la stessa fonte (il roster) risolve sia "chi è
// ancora dentro" sia "stesso account, nome diverso" in un colpo solo. Il
// nickname mostrato è sempre quello ATTUALE nel roster, mai quello vecchio
// congelato nella battaglia (risolve anche i nomi non più aggiornati).
//
// Le battaglie salvate PRIMA di questa modifica non hanno un wizardId
// (il log grezzo non resta conservato dopo l'import, quindi non è
// recuperabile a ritroso): per quelle sole si ripiega sul confronto per
// nickname testuale — meno preciso, ma l'unico dato che esiste per il
// passato. Ogni nuovo import da oggi è già preciso al 100%.
async function loadRosterFilteredBattles(included) {
  const [byDefense, roster] = await Promise.all([loadAllBattlesByDefense(included), getRoster()]);
  const byWizardId = new Map(roster.filter((r) => r.wizardId != null).map((r) => [r.wizardId, r.nickname]));
  const rosterNicks = new Set(roster.map((r) => normalizeNickname(r.nickname)));
  const inRoster = (nick) => !roster.length || rosterNicks.has(normalizeNickname(nick));

  const out = new Map();
  for (const [dK, battles] of byDefense) {
    const filtrate = [];
    for (const b of battles) {
      if (b.wizardId != null && roster.length) {
        // Percorso preciso: c'è l'ID, basta guardare se è ancora nel roster.
        const nomeAttuale = byWizardId.get(b.wizardId);
        if (nomeAttuale) filtrate.push({ ...b, ownerNick: nomeAttuale });
        // altrimenti: quell'account non è (più) in gilda, si scarta
      } else if (inRoster(b.ownerNick)) {
        // Ripiego per battaglie vecchie senza wizardId: solo confronto testo.
        filtrate.push(b);
      }
    }
    if (filtrate.length) out.set(dK, filtrate);
  }
  return out;
}

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
// NON più usata per la deduplica (28/09/2026): il log_id del gioco NON è univoco
// (21 battaglie diverse condividono lo stesso id nei log reali, anche per lo
// stesso giocatore in siege diverse). Resta definita solo perché
// wipeAllLiveData la cancella, e perché sui dati vecchi è già piena.
const SEEN_KEY = "siegeDef:seenLogIds";

// Identità di una difesa: proprietario + i 3 mostri, per ID GREZZO — MAI
// per nome. Un nome può risolversi diversamente a seconda di quando il
// bestiario è stato sincronizzato al momento dell'import (bug reale
// scoperto il 04/08/2026: la stessa identica difesa, stesso ID, appariva
// due volte — una "Sconosciuto", una col nome giusto — solo perché
// importate in momenti diversi). L'ID del gioco non cambia mai, quindi la
// chiave costruita sugli ID è stabile per sempre, indipendentemente da
// quanto è completo il bestiario in quel momento.
function buildDefenseKey(ownerNick, unitIds) {
  const sorted = [...unitIds].sort((a, b) => a - b);
  return `${normalizeMonsterName(ownerNick)}::${sorted.join("|")}`;
}

// Risolve i nomi SEMPRE al momento della lettura, mai una volta sola
// all'import — così se il bestiario migliora dopo (nuove seconde
// awakening, nuovi collab), le difese già importate si aggiornano da sole
// la prossima volta che le guardi, senza dover reimportare nulla.
async function buildNameResolver() {
  const [monsterList, canonicalMap] = await Promise.all([getFullMonsterList(), getCanonicalNameMap()]);
  const nameByComId = new Map();
  for (const m of monsterList) if (m.com2usId) nameByComId.set(m.com2usId, m.name);
  return (id) => canonicalMonsterName(nameByComId.get(id) || `Sconosciuto (ID ${id})`, canonicalMap);
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
          logId: b.log_id, // NON univoco (vedi battleIdentity): tenuto solo come dato informativo
          wizardId: b.wizard_id, // ID fisso dell'account: la vera identità, il nickname può cambiare
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

// --- Deduplica delle battaglie di difesa (28/09/2026) ------------------------
// PRIMA si deduplicava per log_id contro un elenco "già visti" letto una volta
// sola a inizio import. Due errori, verificati sui log reali:
//  1) Lo stesso file contiene più volte lo stesso blocco (13 nel log da 132 MB)
//     con righe sovrapposte: il confronto era solo con quanto salvato PRIMA,
//     non con le righe dello stesso file, quindi ogni battaglia veniva salvata
//     una volta per ogni blocco in cui compariva (1917 salvate, 1708 distinte).
//  2) Il log_id non è univoco: 21 battaglie diverse lo condividono, e una
//     veniva scartata come "già vista".
// Ora una battaglia si riconosce da ciò che è: siege, giocatore, orario,
// squadra ed esito, più il nome di chi ha attaccato (due attaccanti possono
// colpire la stessa base nello stesso secondo). Il confronto avviene con le
// battaglie GIÀ SALVATE della stessa siege, quindi funziona anche sui dati
// importati col vecchio sistema, e cancellare una siege permette di reimportarla.
const plainName = (v) => String(v ?? "").trim().toLowerCase();

function battleBaseSignature(siegeKey, ownerNick, timestamp, unitIds, won) {
  return [siegeKey, plainName(ownerNick), timestamp, [...unitIds].sort((a, b) => a - b).join(","), won ? 1 : 0].join("|");
}

// baseSignature -> lista dei nemici già salvati per quella battaglia
// (null = battaglia vecchia senza il nome del nemico: combacia con qualunque nemico,
// meglio saltare una riga che duplicarla).
async function loadKnownBattles(siegeKeys) {
  const known = new Map();
  for (const siegeKey of siegeKeys) {
    const ids = await redis.smembers(battlesBySiegeKey(siegeKey));
    for (const idBatch of chunk(ids, BATCH_SIZE)) {
      const records = await redis.mget(...idBatch.map(battleRecordKey));
      for (const rec of records) {
        if (!rec) continue;
        const base = battleBaseSignature(rec.siegeKey || siegeKey, rec.ownerNick, rec.timestamp, rec.unitIds || [], rec.won);
        const list = known.get(base) || [];
        list.push(rec.enemyWizardName ? plainName(rec.enemyWizardName) : null);
        known.set(base, list);
      }
    }
  }
  return known;
}

// --- Piazzamento in siege (1st/2nd/3rd) (29/09/2026, Flora) ------------------
// `match_rank`/`match_score` stanno in `log_list[].guild_info_list[]`, UNA
// VOLTA PER SIEGE — un punto diverso della stessa risposta da dove si
// leggono le singole battaglie (`battle_log_list`). Qualsiasi log che
// contiene GetGuildSiegeBattleLog ce l'ha, anche quelli usati per i
// counter/attacchi: non serve un file "apposta".
function extractGuildRankRows(rawLogText, guildName) {
  const rows = [];
  let idx = 0;
  while (true) {
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
      for (const g of logGroup.guild_info_list || []) {
        if (g.guild_name !== guildName) continue; // solo la riga della NOSTRA gilda
        if (g.siege_id == null || g.match_id == null || g.match_rank == null) continue;
        rows.push({ siegeId: g.siege_id, matchId: g.match_id, matchRank: g.match_rank, matchScore: g.match_score ?? null });
      }
    }
  }
  return rows;
}

// Aggancia il piazzamento a siege GIÀ SALVATE (mai crea una siege nuova solo
// per il piazzamento: senza battaglie di difesa non avrebbe senso). Usata
// SIA dallo strumento temporaneo per recuperare le siege vecchie, SIA da
// ogni import normale delle difese da qui in poi.
async function applyGuildRanksToSieges(rows) {
  let updated = 0, notFound = 0, unchanged = 0;
  for (const row of rows) {
    const siegeKey = siegeKeyOf(row.siegeId, row.matchId);
    const record = await redis.get(siegeRecordKey(siegeKey));
    if (!record) { notFound++; continue; }
    if (record.ourRank === row.matchRank && record.ourScore === row.matchScore) { unchanged++; continue; }
    record.ourRank = row.matchRank;
    record.ourScore = row.matchScore;
    await redis.set(siegeRecordKey(siegeKey), record);
    updated++;
  }
  return { updated, notFound, unchanged, totalRows: rows.length };
}

// Strumento TEMPORANEO (29/09/2026, Flora): recupera il piazzamento per le
// siege importate PRIMA che il codice lo leggesse, usando i log già
// caricati per i counter (stesso comando, contiene entrambe le cose). Da
// togliere una volta recuperato lo storico — da lì in poi il piazzamento
// arriva da solo con l'import normale delle difese.
export async function importGuildRanksFromLog(rawLogText) {
  const guildName = await getGuildName();
  const rows = extractGuildRankRows(rawLogText, guildName);
  if (!rows.length) return { updated: 0, notFound: 0, unchanged: 0, totalRows: 0 };
  return applyGuildRanksToSieges(rows);
}

export async function importSiegeDefenseLog(rawLogText) {
  const guildName = await getGuildName();
  const rawRows = extractDefenseRows(rawLogText, guildName);
  // Il piazzamento (guild_info_list) sta in un punto diverso della stessa
  // risposta rispetto alle battaglie (battle_log_list): si estrae SEMPRE,
  // anche quando non ci sono righe di difesa da salvare in questo file.
  const rankRows = extractGuildRankRows(rawLogText, guildName);
  if (!rawRows.length) {
    const rankResult = rankRows.length ? await applyGuildRanksToSieges(rankRows) : null;
    return { imported: 0, skippedDuplicate: 0, sieges: [], ranksUpdated: rankResult?.updated || 0 };
  }

  // Deduplica: contro le battaglie già salvate delle siege toccate E contro le
  // righe già accettate in questo stesso file (vedi battleBaseSignature).
  const siegeKeysInFile = [...new Set(rawRows.map((r) => siegeKeyOf(r.siegeId, r.matchId)))];
  const known = await loadKnownBattles(siegeKeysInFile);
  const toStore = [];
  for (const r of rawRows) {
    const base = battleBaseSignature(siegeKeyOf(r.siegeId, r.matchId), r.ownerNick, r.timestamp, r.unitIds, r.won);
    const enemy = plainName(r.enemyWizardName);
    const list = known.get(base) || [];
    if (list.some((e) => e === null || e === enemy)) continue; // già salvata, o ripetuta nel file
    list.push(enemy);
    known.set(base, list);
    toStore.push(r);
  }
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

    // Niente risoluzione nome qui — solo l'ID grezzo, per sempre stabile.
    // Il nome si calcola fresco quando qualcuno legge, mai una volta sola qui.
    const defKey = buildDefenseKey(r.ownerNick, r.unitIds);
    touchedDefenses.add(defKey);

    const battleId = `sdb_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    pipeline.set(battleRecordKey(battleId), {
      id: battleId,
      siegeKey,
      defenseKey: defKey,
      wizardId: r.wizardId ?? null,
      ownerNick: r.ownerNick,
      unitIds: r.unitIds,
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
  const rankResult = rankRows.length ? await applyGuildRanksToSieges(rankRows) : null;

  return { imported: toStore.length, skippedDuplicate, sieges: [...touchedSieges.keys()], ranksUpdated: rankResult?.updated || 0 };
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

// Ripulisce i DOPPIONI già salvati (28/09/2026, Flora). Le siege importate col
// vecchio sistema possono avere ogni battaglia salvata più volte (vedi il commento
// sulla deduplica sopra): una siege con 500-760 battaglie invece delle ~250 vere è
// il segnale tipico. Per ogni gruppo di battaglie identiche ne resta UNA.
// Con `dryRun: true` calcola soltanto (anteprima), senza toccare niente: stesso
// identico conteggio che poi farà l'applicazione vera.
// Prudenza, perché elimina dati: si toglie una battaglia solo se ne esiste già
// un'altra IDENTICA. I record a cui manca un dato (orario, squadra completa)
// non si toccano mai, per non fonderne di diverse per sbaglio. Le spunte
// incluse/escluse delle siege restano quelle che erano.
export async function dedupeStoredBattles({ dryRun = true } = {}) {
  const sieges = await listSieges();
  const report = [];
  let totalBefore = 0;
  let totalRemoved = 0;

  for (const sg of sieges) {
    const ids = await redis.smembers(battlesBySiegeKey(sg.siegeKey));
    const records = [];
    for (const idBatch of chunk(ids, BATCH_SIZE)) {
      const recs = await redis.mget(...idBatch.map(battleRecordKey));
      for (const r of recs) if (r) records.push(r);
    }
    totalBefore += records.length;

    // Prima i record col nome del nemico: se una copia è più completa, si tiene quella.
    records.sort((a, b) => (a.enemyWizardName ? 0 : 1) - (b.enemyWizardName ? 0 : 1) || String(a.id).localeCompare(String(b.id)));
    const kept = new Map(); // firma -> nemici delle copie tenute (null = nome non registrato)
    const toRemove = [];
    for (const r of records) {
      const verificabile = Number.isFinite(r.timestamp) && Array.isArray(r.unitIds) && r.unitIds.length === 3;
      if (!verificabile) continue; // dato mancante: mai eliminare
      const base = battleBaseSignature(r.siegeKey || sg.siegeKey, r.ownerNick, r.timestamp, r.unitIds, r.won);
      const enemy = r.enemyWizardName ? plainName(r.enemyWizardName) : null;
      const list = kept.get(base) || [];
      if (list.some((e) => e === null || enemy === null || e === enemy)) { toRemove.push(r); continue; }
      list.push(enemy);
      kept.set(base, list);
    }

    const after = records.length - toRemove.length;
    if (toRemove.length) {
      report.push({ siegeKey: sg.siegeKey, dateFrom: sg.dateFrom ?? null, enemyGuilds: sg.enemyGuilds || [], before: records.length, after, removed: toRemove.length });
      totalRemoved += toRemove.length;
    }
    if (!dryRun && toRemove.length) {
      for (const batch of chunk(toRemove, 100)) {
        const pipeline = redis.pipeline();
        for (const r of batch) {
          pipeline.del(battleRecordKey(r.id));
          pipeline.srem(battlesBySiegeKey(sg.siegeKey), r.id);
          if (r.defenseKey) pipeline.srem(battlesByDefenseKey(r.defenseKey), r.id);
        }
        await pipeline.exec();
      }
      // il conteggio mostrato nell'elenco siege torna quello vero; "included" resta com'era
      await redis.set(siegeRecordKey(sg.siegeKey), { ...sg, battleCount: after });
    }
  }
  return {
    dryRun, sieges: report, checkedSieges: sieges.length,
    totalBefore, totalRemoved, totalAfter: totalBefore - totalRemoved,
  };
}

// --- Lettura per la pagina pubblica -----------------------------------------

async function includedSiegeKeys() {
  const sieges = await listSieges();
  return new Set(sieges.filter((s) => s.included).map((s) => s.siegeKey));
}

// Prima si leggeva una difesa alla volta (SMEMBERS + tanti GET separati,
// uno per battaglia) — con 100+ difese e migliaia di battaglie erano
// centinaia di andata-ritorno SEQUENZIALI verso Redis, da cui la lentezza
// vera segnalata da Flora. Ora: UNA pipeline per prendere tutti gli
// insiemi di ID in un colpo solo, poi UN mget per tutti i record insieme
// — da centinaia di chiamate a 2-3 chiamate totali, indipendentemente da
// quante difese ci sono.
// `included`: Set di siegeKey da tenere, oppure `null` per NON filtrare
// affatto — usato dalla vista "stagione intera", che deve ignorare le
// spunte incluse/escluse e contare OGNI siege mai caricata, a differenza
// di tutte le altre viste (per team, per giocatore, dettaglio) che invece
// rispettano sempre la selezione corrente dell'utente.
//
// Letta A BLOCCHI (27/09/2026, Flora): con `included = null` questa
// funzione può dover caricare LO STORICO INTERO della gilda in un colpo
// solo — mai successo prima, perché tutte le altre viste filtravano già a
// un sottoinsieme gestibile di siege. Con migliaia di battaglie accumulate,
// un unico `mget` gigante su Upstash si bloccava (pagina che caricava
// all'infinito, senza nemmeno un errore). Spezzato in blocchi da 300 chiavi:
// più chiamate, ma ognuna piccola e sicura.
const BATCH_SIZE = 300;
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function loadAllBattlesByDefense(included) {
  const defenseKeys = await redis.smembers(DEFENSE_INDEX_KEY);
  if (!defenseKeys.length) return new Map();

  // SMEMBERS in pipeline, ma a blocchi: con centinaia di difese diverse
  // anche solo questa pipeline poteva diventare enorme in un colpo solo.
  const idsByDefense = new Map();
  const allIds = [];
  for (const batch of chunk(defenseKeys, BATCH_SIZE)) {
    const pipeline = redis.pipeline();
    for (const dK of batch) pipeline.smembers(battlesByDefenseKey(dK));
    const idSets = await pipeline.exec(); // stesso ordine di `batch`
    for (let i = 0; i < batch.length; i++) {
      const ids = idSets[i] || [];
      idsByDefense.set(batch[i], ids);
      allIds.push(...ids);
    }
  }
  if (!allIds.length) return new Map();

  // Stesso principio per il recupero dei record veri: un mget a blocchi
  // invece di uno solo con potenzialmente decine di migliaia di chiavi.
  const byId = new Map();
  for (const idBatch of chunk(allIds, BATCH_SIZE)) {
    const records = await redis.mget(...idBatch.map(battleRecordKey));
    idBatch.forEach((id, i) => { if (records[i]) byId.set(id, records[i]); });
  }

  const out = new Map();
  for (const [dK, ids] of idsByDefense) {
    const battles = ids.map((id) => byId.get(id)).filter(Boolean).filter((b) => !included || included.has(b.siegeKey));
    if (battles.length) out.set(dK, battles);
  }
  return out;
}

// Riepilogo di una difesa a partire dalle sue battaglie già filtrate:
// vittorie/sconfitte totali + lo stamp per gilda nemica. Usata sia per il
// dettaglio di una singola difesa sia per l'archiviazione (dove serve per
// OGNI difesa in un colpo solo) — prima era la stessa logica ripetuta due
// volte, con un rischio concreto che le due copie divergessero nel tempo.
// `resolveName` viene passato da fuori (calcolato UNA volta per l'intera
// richiesta, non una volta a battaglia) e traduce l'ID grezzo nel nome
// ATTUALE — mai un nome salvato in passato, che potrebbe essere invecchiato
// male se il bestiario è cambiato nel frattempo.
function summarizeDefenseBattles(defenseKey, battles, resolveName) {
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
    monsterNames: latest.unitIds.map(resolveName),
    total: battles.length,
    wins,
    losses: battles.length - wins,
    winRate: wins / battles.length,
    enemyGuilds: [...byGuild.values()].sort((a, b) => b.losses - a.losses || b.wins - a.wins),
  };
}

// `allSieges`: quando true, ignora del tutto le spunte incluse/escluse e
// conta OGNI siege mai caricata — usato dalla vista "stagione intera" (chi
// ha il winrate più alto in assoluto, su tutto quello che è stato
// importato). Il comportamento di default (false) resta quello di sempre:
// solo le siege che l'utente ha lasciato spuntate.
export async function listGuildDefenses(searchQuery, allSieges) {
  const included = allSieges ? null : await includedSiegeKeys();
  const [byDefense, resolveName] = await Promise.all([loadRosterFilteredBattles(included), buildNameResolver()]);
  const out = [];
  for (const [dK, battles] of byDefense) {
    const summary = summarizeDefenseBattles(dK, battles, resolveName);
    if (searchQuery && !normalizeMonsterName(summary.ownerNick).includes(normalizeMonsterName(searchQuery))) continue;
    // Nella lista non serve lo stamp per gilda (solo nel dettaglio, quando
    // si espande una difesa) — tolto qui per non mandarlo in giro inutilmente.
    const { enemyGuilds, ...rest } = summary;
    out.push(rest);
  }
  return out.sort((a, b) => b.winRate - a.winRate || b.total - a.total);
}

export async function getGuildDefenseDetail(defenseKey) {
  // Qui serve una sola difesa: SMEMBERS + mget diretti, senza passare dal
  // caricamento in blocco di tutte quante (inutile per un solo dettaglio).
  const included = await includedSiegeKeys();
  const ids = await redis.smembers(battlesByDefenseKey(defenseKey));
  if (!ids.length) return null;
  const [records, resolveName, roster] = await Promise.all([
    redis.mget(...ids.map(battleRecordKey)), buildNameResolver(), getRoster(),
  ]);
  const rosterNicks = new Set(roster.map((r) => normalizeNickname(r.nickname)));
  const battles = records.filter(Boolean).filter((b) => included.has(b.siegeKey));
  if (!battles.length) return null;
  // Fuori gilda: come se questa difesa non esistesse più nelle viste
  // correnti (28/09/2026, Flora) — stesso principio delle altre viste.
  // L'alias per "stesso giocatore, nickname diverso" qui non si applica:
  // ogni defenseKey nasce già da un nickname specifico, e unire qui
  // richiederebbe unire due pagine diverse in una, un cambio più grande.
  if (roster.length && !rosterNicks.has(normalizeNickname(battles[0].ownerNick))) return null;
  return summarizeDefenseBattles(defenseKey, battles, resolveName);
}

// --- Classifica dei GIOCATORI in difesa (28/09/2026, Flora) -------------------
// Sotto questo numero di battaglie il winrate di un giocatore non è
// affidabile (2 vittorie su 2 = "100%"): finisce in una sezione a parte,
// senza posizione, invece di stare in cima alla classifica. Per cambiare la
// soglia basta modificare questo numero.
export const MIN_BATTLES_FOR_RANKING = 10;

// Per ogni giocatore:
//  - winrate COMPLESSIVO su tutte le sue difese (vittorie / battaglie totali);
//  - tutte le sue squadre, ciascuna col suo winrate; quella che gli costa più
//    sconfitte IN ASSOLUTO (non quella col winrate più basso: 10% su 40
//    battaglie pesa più di 0% su 2) è segnata `costliest`;
//  - l'andamento siege per siege, dalla più recente.
// In più la media della gilda (vittorie totali / battaglie totali di TUTTI),
// per dire "+12 punti sulla media" invece di un numero che da solo non dice
// niente: le nostre difese vincono poco, quindi un 25% può essere ottimo.
// Ordinati dal più forte al più debole. `allSieges` ignora le spunte
// incluse/escluse (vedi loadAllBattlesByDefense).
// Il raggruppamento usa la stessa normalizzazione con cui è costruita la
// defenseKey (buildDefenseKey), così "lo stesso giocatore" coincide con
// quello che il resto del sito considera lo stesso proprietario.
export async function listPlayerDefenseRanking(allSieges) {
  const included = allSieges ? null : await includedSiegeKeys();
  // loadRosterFilteredBattles applica GIÀ alias (stesso giocatore, nickname
  // diverso) e filtro roster (solo chi è ancora in gilda) — stesso punto
  // usato da tutte le altre viste correnti, niente da ripetere qui.
  const [byDefense, resolveName, sieges] = await Promise.all([
    loadRosterFilteredBattles(included),
    buildNameResolver(),
    listSieges(),
  ]);
  const siegeMeta = new Map(sieges.map((sg) => [sg.siegeKey, sg]));

  const byOwner = new Map();
  let guildWins = 0;
  let guildTotal = 0;
  for (const [dK, battles] of byDefense) {
    const team = summarizeDefenseBattles(dK, battles, resolveName);
    delete team.enemyGuilds; // non serve nella classifica
    // STESSA normalizzazione del roster (toglie TUTTO il non alfanumerico),
    // non quella per i mostri: "Mai_a_me" e "Mai__a__me" sono la stessa
    // persona, ma normalizeMonsterName non toglie gli underscore e li
    // teneva separati — verificato sui log reali (28/09/2026, Flora).
    const key = normalizeNickname(team.ownerNick);
    const p = byOwner.get(key) || { ownerNick: team.ownerNick, lastTs: -1, wins: 0, losses: 0, total: 0, defenses: [], bySiege: new Map() };
    p.wins += team.wins;
    p.losses += team.losses;
    p.total += team.total;
    p.defenses.push(team);
    for (const b of battles) {
      // il nick mostrato è quello dell'ultima battaglia, come nel resto del sito
      if ((b.timestamp || 0) >= p.lastTs) { p.lastTs = b.timestamp || 0; p.ownerNick = b.ownerNick; }
      const sg = p.bySiege.get(b.siegeKey) || { siegeKey: b.siegeKey, wins: 0, losses: 0 };
      if (b.won) sg.wins++; else sg.losses++;
      p.bySiege.set(b.siegeKey, sg);
    }
    guildWins += team.wins;
    guildTotal += team.total;
    byOwner.set(key, p);
  }

  const finalize = (p) => {
    const defenses = p.defenses.sort((a, b) => b.winRate - a.winRate || b.total - a.total);
    // "Squadra che costa più sconfitte": solo se il giocatore ne ha più di una
    // (con una sola sarebbe ovvio) e ha perso almeno 3 volte con quella.
    if (defenses.length >= 2) {
      const worst = [...defenses].sort((a, b) => b.losses - a.losses || a.winRate - b.winRate)[0];
      if (worst.losses >= 3) worst.costliest = true;
    }
    const sieges = [...p.bySiege.values()].map((sg) => {
      const meta = siegeMeta.get(sg.siegeKey);
      const total = sg.wins + sg.losses;
      return { ...sg, total, winRate: total ? sg.wins / total : 0, dateFrom: meta?.dateFrom ?? null, enemyGuilds: meta?.enemyGuilds ?? [] };
    }).sort((a, b) => (b.dateFrom || 0) - (a.dateFrom || 0));
    return { ownerNick: p.ownerNick, wins: p.wins, losses: p.losses, total: p.total, winRate: p.total ? p.wins / p.total : 0, defenses, sieges };
  };
  const byRate = (a, b) => b.winRate - a.winRate || b.total - a.total;
  const all = [...byOwner.values()].map(finalize);
  return {
    players: all.filter((p) => p.total >= MIN_BATTLES_FOR_RANKING).sort(byRate),
    lowData: all.filter((p) => p.total < MIN_BATTLES_FOR_RANKING).sort(byRate),
    guildAvg: { wins: guildWins, losses: guildTotal - guildWins, total: guildTotal, winRate: guildTotal ? guildWins / guildTotal : 0, playerCount: all.length },
    minBattles: MIN_BATTLES_FOR_RANKING,
  };
}

// --- Vista unificata per TEAM -----------------------------------------------
// Il defenseKey oggi è "proprietario::id|id|id" (ID grezzi, stabili per
// sempre — vedi nota sopra buildDefenseKey). Per il RAGGRUPPAMENTO per team
// però vogliamo i nomi CANONICI freschi, non gli ID grezzi: così due team
// con lo stesso kit ma versione diversa (Shahat vs la sua variante collab
// Wind Bayek) restano uniti nello stesso team, invece di separarsi solo
// perché hanno ID diversi.
function teamKeyFromNames(monsterNames) {
  return [...monsterNames].map(normalizeMonsterName).sort().join("|");
}

// Elenco unificato per team: un team = TUTTI i nostri giocatori che lo usano
// come difesa, sommati insieme. È la vista di default della pagina (nessuna
// ricerca attiva) — vittorie/sconfitte "universali" per quella terna di
// mostri, su tutte le siege incluse, a prescindere da chi la gioca.
export async function listGuildDefensesByTeam() {
  const included = await includedSiegeKeys();
  const [byDefense, resolveName] = await Promise.all([loadRosterFilteredBattles(included), buildNameResolver()]);
  const byTeam = new Map(); // teamKey -> { monsterNames, battles: [] }
  for (const [dK, battles] of byDefense) {
    const monsterNames = battles[0].unitIds.map(resolveName);
    const teamKey = teamKeyFromNames(monsterNames);
    const t = byTeam.get(teamKey) || { teamKey, monsterNames, battles: [], owners: new Set() };
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
  return out.sort((a, b) => b.winRate - a.winRate || b.total - a.total);
}

// Ricerca per team: stessa lista di sopra, filtrata sui team che contengono
// (anche solo parzialmente) il mostro cercato. La query passa dalla stessa
// canonicalizzazione usata per salvare i dati — così cercare "Shahat" trova
// anche team salvati con la sua versione collab "Wind Bayek" (o viceversa),
// non solo la forma esatta già canonica.
export async function searchGuildDefenseTeams(monsterQuery) {
  const teams = await listGuildDefensesByTeam();
  if (!monsterQuery) return teams;
  const canonicalMap = await getCanonicalNameMap();
  const q = normalizeMonsterName(canonicalMonsterName(monsterQuery, canonicalMap));
  return teams.filter((t) => t.monsterNames.some((n) => normalizeMonsterName(n).includes(q) || q.includes(normalizeMonsterName(n))));
}

// Dettaglio di un team aperto: tutti i NOSTRI giocatori che lo usano, ognuno
// con le proprie vittorie/sconfitte e lo stamp per gilda nemica — riusa
// summarizeDefenseBattles per ogni giocatore, stessa identica logica del
// dettaglio di una singola difesa, solo ripetuta per ciascuno.
export async function getTeamDetail(teamKey) {
  const included = await includedSiegeKeys();
  const [byDefense, resolveName] = await Promise.all([loadRosterFilteredBattles(included), buildNameResolver()]);
  const players = [];
  for (const [dK, battles] of byDefense) {
    const monsterNames = battles[0].unitIds.map(resolveName);
    if (teamKeyFromNames(monsterNames) !== teamKey) continue;
    players.push(summarizeDefenseBattles(dK, battles, resolveName));
  }
  if (!players.length) return null;
  players.sort((a, b) => b.winRate - a.winRate || b.total - a.total);

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

// Se non si passano siegeKeys esplicite, usa quelle globalmente incluse
// (comportamento di prima). Passandole, si sceglie ORA per QUESTA
// archiviazione specifica, senza toccare le spunte della pagina pubblica —
// utile per essere sicuri di cosa si sta congelando, invece di fidarsi di
// quello che era rimasto spuntato per altri motivi.
export async function archiveCurrentSeason(siegeKeysToArchive) {
  const sieges = await listSieges();
  const includedSieges = siegeKeysToArchive
    ? sieges.filter((s) => siegeKeysToArchive.includes(s.siegeKey))
    : sieges.filter((s) => s.included);
  if (!includedSieges.length) {
    throw new Error("Nessuna siege selezionata: non c'è niente da archiviare.");
  }

  // Costruisco il fermo immagine completo — build + stamp per gilda per
  // OGNI difesa, calcolato ORA sulle sole siege incluse in questo
  // momento. Da qui in poi questi numeri non cambiano mai più — nomi
  // compresi: si risolvono una volta sola qui, con il bestiario di questo
  // istante, e restano congelati (è un archivio, giusto che sia così).
  const included = new Set(includedSieges.map((s) => s.siegeKey));
  const [byDefense, resolveName] = await Promise.all([loadAllBattlesByDefense(included), buildNameResolver()]);
  const defenses = [...byDefense.entries()].map(([dK, battles]) => summarizeDefenseBattles(dK, battles, resolveName));
  defenses.sort((a, b) => b.winRate - a.winRate || b.total - a.total);

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

  await wipeAllLiveData();

  return { archiveId, label, defenseCount: defenses.length, siegeCount: includedSieges.length };
}

// Svuota TUTTO il live delle Difese Gilda — siege, battaglie, indici —
// SENZA archiviare nulla prima. Diversa da "Archivia": qui si butta via e
// basta, per il caso in cui i dati non vadano conservati (es. un formato
// vecchio incompatibile con una modifica al codice, come il passaggio da
// nome congelato a ID grezzo del 04/08/2026 — i log di siege si
// riscaricano facilmente dal gioco, non serve tenerne una copia rotta).
// Scansione DIRETTA delle chiavi coi prefissi giusti (redis.keys), non
// solo tramite gli indici — stessa cautela già presa per l'archivio dei
// counter, dopo aver scoperto che un indice può avere buchi e lasciare
// dati orfani per sempre.
export async function wipeAllLiveData() {
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
  return { wiped: allKeysToDelete.length };
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
