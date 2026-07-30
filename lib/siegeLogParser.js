import zlib from "zlib";
import { normalizeMonsterName } from "./textUtils";

// Legge un log grezzo di SWEX/SWProxy (tipico "full_log.txt" con dentro
// tante chiamate API una dietro l'altra) ed estrae le battaglie di Guild
// Siege registrate: squadra offensiva usata, squadra difensiva incontrata,
// ed esito (vittoria/sconfitta).
//
// Fonte principale (verificata su un log reale): "GetGuildSiegeBattleLogByWizardId"
// — basta aprire il "Battle Log" di un player IN GIOCO (un click a testa,
// non serve aprire ogni singolo replay) e la risposta contiene già TUTTI
// i suoi attacchi in "battle_log_list", ognuno con:
//   view_battle_deck_info: [[masterId,masterId,masterId], [masterId,masterId,masterId]]
//                            ^ squadra offensiva usata      ^ squadra difensiva incontrata
//   win_lose: 1 = vittoria, 2 = sconfitta (verificato incrociando con i replay aperti)
//
// Un singolo file può contenere più blocchi "Response: \n{...}" — li
// isoliamo cercando ogni occorrenza del comando e poi facendo il parse del
// JSON che segue (bilanciando le graffe a mano, perché il log non è
// newline-delimited in modo pulito).
function extractJsonAfter(text, fromIndex) {
  const start = text.indexOf("{", fromIndex);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractResponsesFor(rawLogText, commandName) {
  const responses = [];
  let idx = rawLogText.indexOf(commandName);
  while (idx !== -1) {
    const responseIdx = rawLogText.indexOf("Response:", idx);
    if (responseIdx !== -1) {
      const json = extractJsonAfter(rawLogText, responseIdx);
      if (json) responses.push(json);
    }
    idx = rawLogText.indexOf(commandName, idx + commandName.length);
  }
  return responses;
}

export function idsKey(ids) {
  return [...ids].sort((a, b) => a - b).join(",");
}

// Legge le battaglie "guardate per intero" (comando GetGuildSiegeBattleReplayData,
// scatta solo se in gioco si guarda l'animazione completa del replay, non
// solo l'anteprima) — dentro c'è un blob compresso (base64+zlib) che, una
// volta decodificato, contiene le RUNE VERE (set_id) di ogni mostro di
// ENTRAMBE le squadre. Raro rispetto al Battle Log semplice, ma quando c'è
// arricchisce il Counter con le rune al posto di lasciarle vuote.
//
// Il pacchetto zlib usa lo stesso formato usato ovunque (compressione
// "deflate" standard) — verificato decomprimendo un log reale fornito
// dall'utente con l'algoritmo zlib nativo di Node.
export function extractRichReplayDetails(rawLogText) {
  const byKey = new Map(); // "offenseIds::defenseIds" (ordinati) -> { offenseIds, offenseRunes }
  for (const json of extractResponsesFor(rawLogText, "GetGuildSiegeBattleReplayData")) {
    const b64 = json?.replay_data;
    if (!b64) continue;
    let parsed;
    try {
      const raw = Buffer.from(b64, "base64");
      parsed = JSON.parse(zlib.inflateSync(raw).toString("utf-8"));
    } catch {
      continue; // log corrotto o formato inatteso: saltiamo, non blocchiamo il resto
    }
    const users = parsed?.battle_info?.battle_users;
    if (!users || users.length < 2) continue;
    // Chi ha vinto (win_lose === 1) è la squadra "offensiva" da usare come
    // base counter; l'altra è la difesa incontrata.
    const attacker = users.find((u) => u.win_lose === 1);
    const defender = users.find((u) => u.win_lose !== 1);
    if (!attacker || !defender) continue;

    const offenseIds = attacker.battle_units.map((bu) => bu.unit.unit_master_id);
    const defenseIds = defender.battle_units.map((bu) => bu.unit.unit_master_id);
    // Stat combat finali (base + rune + set + artefatti + leader + torri,
    // già calcolate dal gioco) — usate sia per l'ordine turni (SPD) sia
    // per il blocco "COMBAT STATS". CRIT Rate/Dmg/Accuracy NON arrivano
    // mai nel replay: li ricalcoliamo a mano da rune+set (vedi runeSets.js).
    const offenseSpd = attacker.battle_units.map((bu) => bu.unit.spd ?? 0);
    const offenseCombatBase = attacker.battle_units.map((bu) => ({
      hp: bu.unit.con ?? null, atk: bu.unit.atk ?? null, def: bu.unit.def ?? null,
      spd: bu.unit.spd ?? null, resistance: bu.unit.resist ?? null,
    }));
    // Ogni runa: set_id (per il nome del set) + slot_no/pri_eff (stat
    // principale) + sec_eff (le 4 sotto-stat) + prefix_eff (bonus extra
    // delle rune "Intricate"/"Strong" rinforzate) — serve tutto per
    // calcolare CRIT Rate/Dmg/Accuracy, non solo il nome del set.
    const offenseRunes = attacker.battle_units.map((bu) =>
      (bu.unit.runes || []).map((r) => ({
        set_id: r.set_id, slot_no: r.slot_no, pri_eff: r.pri_eff,
        sec_eff: r.sec_eff, prefix_eff: r.prefix_eff,
      }))
    );
    // Artefatti grezzi (li traduciamo dopo con lib/artifactEffects.js) —
    // ogni mostro ne ha 0-2, ognuno con type (1=Attributo, 2=Tipo),
    // attribute (elemento, solo per gli Attributo) e i sec_effects.
    const offenseArtifacts = attacker.battle_units.map((bu) => bu.unit.artifacts || []);

    const key = `${idsKey(offenseIds)}::${idsKey(defenseIds)}`;
    if (!byKey.has(key)) byKey.set(key, { offenseIds, offenseRunes, offenseArtifacts, offenseSpd, offenseCombatBase });
  }
  return byKey;
}

// Estrae le "voci" grezze (una per attacco) da entrambe le fonti possibili
// nel log, con già dentro le sole informazioni che servono: squadra
// offensiva, squadra difensiva (array di master_id), ed esito.
export function extractBattleEntries(rawLogText) {
  const entries = [];

  // Fonte principale: Battle Log di un player (un click a testa in gioco).
  for (const json of extractResponsesFor(rawLogText, "GetGuildSiegeBattleLogByWizardId")) {
    for (const log of json?.log_list || []) {
      for (const b of log?.battle_log_list || []) {
        const deck = b.view_battle_deck_info;
        if (!deck?.[0] || !deck?.[1]) continue;
        // battleId univoco per questo attacco esatto — serve solo al sistema
        // cross-player (lib/siegeStats.js) per non contare due volte lo
        // stesso attacco se lo stesso log viene ricaricato per sbaglio.
        const battleId = b.wizard_id != null && b.log_id != null ? `${b.wizard_id}:${b.log_id}` : null;
        entries.push({ offenseIds: deck[0], defenseIds: deck[1], win: b.win_lose === 1, battleId });
      }
    }
  }

  // Fonte di riserva: replay aperti singolarmente (se qualcuno preferisce
  // cliccare i replay uno per uno invece del Battle Log riassuntivo).
  for (const json of extractResponsesFor(rawLogText, "getBattleReplayInfo")) {
    const info = json?.replay_info?.battle_info;
    if (!info?.unit_list || !info?.opp_unit_list || !info?.result_list) continue;
    const replayRid = json?.replay_info?.rid ?? null;
    for (let w = 0; w < info.result_list.length; w++) {
      if (!info.unit_list[w] || !info.opp_unit_list[w]) continue;
      const battleId = replayRid != null ? `replay:${replayRid}:${w}` : null;
      entries.push({ offenseIds: info.unit_list[w], defenseIds: info.opp_unit_list[w], win: info.result_list[w] === 1, battleId });
    }
  }

  return entries;
}

// Trasforma le voci grezze in coppie (difesa, attacco) con esito, usando
// la tabella nome<->com2usId già sincronizzata da swarfarm sul sito.
export function entriesToMatchups(entries, monsterByComId) {
  const matchups = [];
  for (const e of entries) {
    const offenseNames = e.offenseIds.map((id) => monsterByComId.get(id) || null);
    const defenseNames = e.defenseIds.map((id) => monsterByComId.get(id) || null);
    // Se anche un solo mostro non si riesce a tradurre in nome, saltiamo
    // questa voce: meglio ometterla che importare una Difesa con "???" dentro.
    if (offenseNames.includes(null) || defenseNames.includes(null)) continue;
    matchups.push({ offense: offenseNames, defense: defenseNames, win: e.win, battleId: e.battleId || null });
  }
  return matchups;
}

function teamKey(names) {
  return [...names].map((n) => normalizeMonsterName(n)).sort().join("|");
}

// Chiave ORDINATA (posizione 1 = leader conta) — usata SOLO dal sistema
// cross-player (lib/siegeStats.js). A differenza di teamKey() qui sopra
// (che ignora l'ordine, usata dall'import singolo-giocatore per permettere
// varianti dello stesso counter), un leader diverso è considerato offence
// DIVERSA — ma l'ordine delle altre 2 unit (turno 2/3) NON conta, sono
// intercambiabili ai fini dell'identità del counter.
export function orderedTeamKey(names) {
  const [lead, ...rest] = names;
  return [normalizeMonsterName(lead), ...rest.map((n) => normalizeMonsterName(n)).sort()].join("|");
}

// Chiave NON ordinata per la difesa incontrata (chi possiede la difesa non
// conta, solo i 3 mostri) — usata dal sistema cross-player per identificare
// "la stessa difesa" a prescindere da gilda/proprietario avversario.
export function defenseKey(names) {
  return teamKey(names);
}

// Raggruppa per coppia ESATTA (difesa, attacco) e calcola il tasso di
// vittoria — così se lo stesso identico attacco compare più volte nel
// log (anche in Siege diversi, se incolli più log insieme), si somma.
export function aggregateMatchups(matchups) {
  const groups = new Map();
  for (const m of matchups) {
    const key = `${teamKey(m.defense)}::${teamKey(m.offense)}`;
    if (!groups.has(key)) {
      groups.set(key, { defense: m.defense, offense: m.offense, wins: 0, total: 0 });
    }
    const g = groups.get(key);
    g.total++;
    if (m.win) g.wins++;
  }
  return Array.from(groups.values()).map((g) => ({ ...g, winRate: g.wins / g.total }));
}

