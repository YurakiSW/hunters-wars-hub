import { NextResponse } from "next/server";
import { getCurrentUser, canManage } from "../../../../lib/auth";
import { getFullMonsterList } from "../../../../lib/monsters";
import { listDefs, bulkCreateDefsAndCounters, newId } from "../../../../lib/defs";
import { normalizeMonsterName } from "../../../../lib/textUtils";
import { extractBattleEntries, entriesToMatchups, aggregateMatchups, extractRichReplayDetails, idsKey, orderedTeamKey, defenseKey } from "../../../../lib/siegeLogParser";
import { describeRuneSets } from "../../../../lib/runeSets";
import { describeUnitArtifacts } from "../../../../lib/artifactEffects";
import { recordCrossPlayerBattles } from "../../../../lib/siegeStats";
import { safeJson } from "../../../../lib/apiUtils";

export const maxDuration = 60;

function defKey(monsters) {
  return monsters.map((m) => normalizeMonsterName(m)).sort().join("|");
}

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

  // Tabella com2usId -> nome mostro, da quelli già sincronizzati da swarfarm.
  const monsterList = await getFullMonsterList();
  const monsterByComId = new Map();
  for (const m of monsterList) {
    if (m.com2usId) monsterByComId.set(m.com2usId, m.name);
  }
  if (monsterByComId.size === 0) {
    return NextResponse.json({ error: "Nessun mostro con com2usId trovato — rilancia prima la sincronizzazione mostri (con il codice aggiornato)." }, { status: 400 });
  }

  const entries = extractBattleEntries(logText);
  const matchups = entriesToMatchups(entries, monsterByComId);
  const aggregated = aggregateMatchups(matchups);

  // Nome -> com2usId (il contrario della mappa sopra), per ritrovare i replay
  // "ricchi" (con le rune vere) partendo dai nomi già tradotti dei matchup.
  const comIdByName = new Map();
  for (const [id, name] of monsterByComId) comIdByName.set(name, id);
  const richByIdsKey = extractRichReplayDetails(logText);

  // Alimenta anche il database cross-player (usato dal tab "Approvazioni
  // Siege Log"): OGNI battaglia di questo log, vinta o persa, si somma a
  // quelle già viste da altri caricamenti — non solo quelle sopra il 50%
  // (serve il conteggio completo per calcolare il winRate reale).
  const richUnitsByOffenseDefenseKey = new Map();
  for (const m of matchups) {
    const offenseIds = m.offense.map((n) => comIdByName.get(n)).filter(Boolean);
    const defenseIds = m.defense.map((n) => comIdByName.get(n)).filter(Boolean);
    const rich = richByIdsKey.get(`${idsKey(offenseIds)}::${idsKey(defenseIds)}`);
    if (!rich) continue;
    // Salviamo i dati GREZZI (set_id delle rune, sec_effects degli
    // artefatti), non il testo già tradotto: così se in futuro decodifichiamo
    // altri codici, le proposal già in coda si aggiornano da sole quando le
    // guardi — non serve ricaricare lo stesso log da capo.
    const units = m.offense.map((name, i) => ({
      name,
      rawRunes: rich.offenseRunes[i],
      rawArtifacts: rich.offenseArtifacts[i],
    }));
    richUnitsByOffenseDefenseKey.set(`${orderedTeamKey(m.offense)}::${defenseKey(m.defense)}`, units);
  }
  const crossPlayerResult = await recordCrossPlayerBattles(matchups, richUnitsByOffenseDefenseKey);

  // Solo attacchi vincenti E con più del 50% di successo su quella difesa
  // esatta (utile se lo stesso attacco compare più volte nel log).
  const winningMatchups = aggregated.filter((g) => g.wins > 0 && g.winRate > 0.5);

  const existingDefs = await listDefs();
  const existingByKey = new Map(existingDefs.map((d) => [defKey(d.monsters), d]));

  // Costruiamo tutto in memoria PRIMA di toccare Redis: con centinaia di
  // counter vincenti in un log grande, crearli uno per uno (sequenziale)
  // rischia il timeout della funzione. Una singola pipeline alla fine.
  const newDefsToCreate = [];
  const newCountersToCreate = [];
  // Traccia gli offense già assegnati a ciascuna Difesa (esistenti + appena
  // pianificati in questo stesso import) per non creare doppioni.
  const plannedOffenseByDefKey = new Map(); // defKey -> Set(offenseKey)
  for (const d of existingDefs) {
    plannedOffenseByDefKey.set(defKey(d.monsters), new Set((d.counters || []).map((c) => defKey(c.offense))));
  }

  let createdDefs = 0;
  let createdCounters = 0;
  const skipped = [];

  for (const m of winningMatchups) {
    const key = defKey(m.defense);
    let def = existingByKey.get(key);
    if (!def) {
      const id = newId("def");
      def = { id, monsters: m.defense };
      newDefsToCreate.push({
        id, monsters: m.defense,
        desc: "Importata da log SWEX (Siege). Solo squadra offensiva verificata: rune/artefatti/strategia da completare.",
        authorId: user.id, authorNickname: `Import Log (${user.nickname})`, autoApprove: false,
      });
      existingByKey.set(key, def);
      plannedOffenseByDefKey.set(key, new Set());
      createdDefs++;
    }

    // Evita di ricreare lo stesso counter (stessa squadra offensiva) se il
    // log viene ricaricato una seconda volta per sbaglio, o se questo
    // stesso import lo ha già pianificato un momento fa.
    const offenseKey = defKey(m.offense);
    const plannedSet = plannedOffenseByDefKey.get(key);
    if (plannedSet.has(offenseKey)) {
      skipped.push(`${m.offense.join("/")} contro ${m.defense.join("/")} (già presente)`);
      continue;
    }
    plannedSet.add(offenseKey);

    // Se questa esatta squadra contro questa esatta difesa è stata anche
    // "guardata per intero" (replay completo, non solo il Battle Log),
    // abbiamo le rune vere di ogni mostro — le usiamo per non lasciare il
    // campo Rune vuoto.
    const offenseIdsForMatch = m.offense.map((n) => comIdByName.get(n)).filter(Boolean);
    const defenseIdsForMatch = m.defense.map((n) => comIdByName.get(n)).filter(Boolean);
    const richKey = `${idsKey(offenseIdsForMatch)}::${idsKey(defenseIdsForMatch)}`;
    const rich = richByIdsKey.get(richKey);

    newCountersToCreate.push({
      id: newId("counter"),
      defId: def.id,
      offense: m.offense,
      lead: m.offense[0],
      turnOrder: m.offense,
      units: m.offense.map((name, i) => {
        const artifacts = rich ? describeUnitArtifacts(rich.offenseArtifacts[i]) : { artifactLeft: [], artifactRight: [] };
        return {
          name, lead: false,
          runes: rich ? describeRuneSets(rich.offenseRunes[i]) : "",
          stats: "", statsFlexible: false, statsMinText: "",
          artifactLeft: artifacts.artifactLeft, artifactRight: artifacts.artifactRight,
          notes: [""],
        };
      }),
      focus: [],
      strategy: `Importato da log SWEX: ${m.wins}/${m.total} vittorie (${Math.round(m.winRate * 100)}%) contro questa difesa. ${rich ? "Rune e artefatti trovati nel replay — controllali comunque, alcuni codici potrebbero non essere ancora tradotti." : "Rune/artefatti da completare."} Strategia da scrivere.`,
      warning: "",
      video: null,
      images: [],
      authorId: user.id, authorNickname: `Import Log (${user.nickname})`, autoApprove: false,
    });
    createdCounters++;
  }

  await bulkCreateDefsAndCounters(newDefsToCreate, newCountersToCreate);

  return NextResponse.json({
    ok: true,
    entriesFound: entries.length,
    matchupsFound: aggregated.length,
    winningMatchups: winningMatchups.length,
    createdDefs,
    createdCounters,
    skipped,
    crossPlayerNewBattles: crossPlayerResult.newBattles,
    crossPlayerTouchedPairs: crossPlayerResult.touchedPairs,
  });
}
