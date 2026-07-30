import { NextResponse } from "next/server";
import { getCurrentUser, canManage } from "../../../../lib/auth";
import { getFullMonsterList } from "../../../../lib/monsters";
import { extractBattleEntries, entriesToMatchups, aggregateMatchups, extractRichReplayDetails, idsKey, orderedTeamKey, defenseKey } from "../../../../lib/siegeLogParser";
import { recordCrossPlayerBattles } from "../../../../lib/siegeStats";
import { safeJson } from "../../../../lib/apiUtils";

export const maxDuration = 60;

// UNICO percorso di creazione da log: alimenta solo il sistema cross-player
// (lib/siegeStats.js). Le Difese/Counter veri e propri nascono SOLO da lì
// (tab "Approvazioni Siege Log" -> Approva/Modifica e approva/Approva in
// blocco), mai direttamente da questo import -- prima esisteva anche un
// secondo percorso di creazione diretta, che duplicava lo stesso counter
// due volte (uno "Import Log", uno "Siege Log") sulla stessa identica
// battaglia. Rimosso il 29/07/2026.
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !canManage(user)) {
    return NextResponse.json({ error: "Solo Admin e Revisori possono importare da un log." }, { status: 403 });
  }

  const { data, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });
  const { logText } = data;
  if (!logText || typeof logText !== "string") {
    return NextResponse.json({ error: "Manca il testo del log." }, { status: 400 });
  }

  // Tabella com2usId -> nome mostro, da quelli gia' sincronizzati da swarfarm.
  const monsterList = await getFullMonsterList();
  const monsterByComId = new Map();
  for (const m of monsterList) {
    if (m.com2usId) monsterByComId.set(m.com2usId, m.name);
  }
  if (monsterByComId.size === 0) {
    return NextResponse.json({ error: "Nessun mostro con com2usId trovato -- rilancia prima la sincronizzazione mostri (con il codice aggiornato)." }, { status: 400 });
  }

  const entries = extractBattleEntries(logText);
  const matchups = entriesToMatchups(entries, monsterByComId);
  const aggregated = aggregateMatchups(matchups);

  // Nome -> com2usId (il contrario della mappa sopra), per ritrovare i replay
  // "ricchi" (con le rune vere) partendo dai nomi gia' tradotti dei matchup.
  const comIdByName = new Map();
  for (const [id, name] of monsterByComId) comIdByName.set(name, id);
  const richByIdsKey = extractRichReplayDetails(logText);

  // Alimenta il database cross-player (usato dal tab "Approvazioni Siege
  // Log"): OGNI battaglia di questo log, vinta o persa, si somma a quelle
  // gia' viste da altri caricamenti -- non solo quelle sopra il 90% (serve
  // il conteggio completo per calcolare il winRate reale).
  const richUnitsByOffenseDefenseKey = new Map();
  for (const m of matchups) {
    const offenseIds = m.offense.map((n) => comIdByName.get(n)).filter(Boolean);
    const defenseIds = m.defense.map((n) => comIdByName.get(n)).filter(Boolean);
    const rich = richByIdsKey.get(`${idsKey(offenseIds)}::${idsKey(defenseIds)}`);
    if (!rich) continue;
    // BUG CORRETTO IL 30/07/2026: idsKey() ordina gli ID per trovare la
    // coppia giusta (giusto, l'ordine non deve contare per il MATCH) — ma
    // l'ordine dei mostri nel replay vero (rich.offenseIds) può essere
    // DIVERSO dall'ordine della squadra "semplice" (m.offense, da
    // view_battle_deck_info/unit_list). Prendere rich.offenseRunes[i] per
    // POSIZIONE (invece che per ID) attaccava le rune/artefatti/relic al
    // mostro sbagliato ogni volta che i due ordini non combaciavano —
    // scoperto con un caso vero (Water Gandalf con artefatti che in game
    // erano DEF+DEF, mostrati come ATK: erano quelli di un compagno di
    // squadra scambiato di posizione). Ora si cerca l'indice giusto
    // guardando l'unit_master_id di ciascun mostro, mai la posizione.
    const richIndexByUnitId = new Map();
    rich.offenseIds.forEach((id, idx) => { if (!richIndexByUnitId.has(id)) richIndexByUnitId.set(id, idx); });
    // Salviamo i dati GREZZI (set_id delle rune, sec_effects degli
    // artefatti), non il testo gia' tradotto: cosi' se in futuro
    // decodifichiamo altri codici, le proposal gia' in coda si aggiornano
    // da sole quando le guardi -- non serve ricaricare lo stesso log da capo.
    const units = m.offense.map((name, i) => {
      const richIdx = richIndexByUnitId.get(offenseIds[i]);
      if (richIdx == null) {
        return { name, rawRunes: null, rawArtifacts: null, rawRelics: null, rawSpd: null, rawCombatBase: null };
      }
      return {
        name,
        rawRunes: rich.offenseRunes[richIdx],
        rawArtifacts: rich.offenseArtifacts[richIdx],
        rawRelics: rich.offenseRelics?.[richIdx] ?? null,
        rawSpd: rich.offenseSpd?.[richIdx] ?? null,
        rawCombatBase: rich.offenseCombatBase?.[richIdx] ?? null,
      };
    });
    richUnitsByOffenseDefenseKey.set(`${orderedTeamKey(m.offense)}::${defenseKey(m.defense)}`, units);
  }
  const crossPlayerResult = await recordCrossPlayerBattles(matchups, richUnitsByOffenseDefenseKey);

  // Solo per il messaggio di riepilogo mostrato all'utente (non crea piu'
  // nulla direttamente): quante coppie superano gia' il 90% con questo log.
  const winningMatchups = aggregated.filter((g) => g.wins > 0 && g.winRate > 0.9);

  return NextResponse.json({
    ok: true,
    entriesFound: entries.length,
    matchupsFound: aggregated.length,
    winningMatchups: winningMatchups.length,
    crossPlayerNewBattles: crossPlayerResult.newBattles,
    crossPlayerTouchedPairs: crossPlayerResult.touchedPairs,
  });
}
