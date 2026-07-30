// Numeri usati nei log SWEX per le RELIC (7° slot, equipaggiamento a parte
// dagli Artefatti). I codici si sono rivelati gli stessi degli artefatti,
// ma la tabella resta separata: sono due sistemi distinti del gioco e nulla
// garantisce che restino allineati in futuro.
//
// CONFERMATO con relic reali + screenshot in game:
//   Gandalf/Angela [102, 9]  = "+6 Hearty Restore Relic: DEF +9%"  -> 102 = DEF
//   Nobara         [100, 10] = "+7 Nimble Primal Relic: HP +10%"   -> 100 = HP
// 101 = ATK per esclusione (mai visto su un mostro verificato).
//
// A differenza degli artefatti (bonus flat), la relic dà sempre una
// PERCENTUALE, e il valore grezzo è già la percentuale finale.
export const RELIC_MAIN_STAT_BY_ID = {
  100: "HP",
  101: "ATK", // unico non ancora verificato con screenshot
  102: "DEF",
};

export function relicMainStatFromCode(code) {
  return RELIC_MAIN_STAT_BY_ID[code] ?? null;
}

// Valore percentuale della relic (pri_effect[1]) — a differenza degli
// artefatti, qui il numero è già la percentuale vera, nessuna divisione
// per livello necessaria (verificato: +6→9%, +8→11%, +10→13%, il valore
// grezzo COINCIDE sempre con quello mostrato in game).
export function relicMainStatValue(rawRelic) {
  return rawRelic?.pri_effect?.[1] ?? null;
}

// Prende la relic grezza di UN mostro (dal replay, max 1 slot: unit.relics[0])
// e restituisce solo il main stat leggibile ("HP"/"ATK"/"DEF") o null se
// assente/non riconosciuto. Per ora non traduciamo l'effetto unico (non
// richiesto) — solo il dato che serve per compilare il Counter in automatico.
export function describeUnitRelic(rawRelics) {
  const r = rawRelics?.[0];
  if (!r?.pri_effect) return null;
  return relicMainStatFromCode(r.pri_effect[0]);
}
