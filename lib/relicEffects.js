// Numeri usati nei log SWEX per le RELIC (7° slot, diverso dagli Artefatti:
// namespace di codici separato, NON riusare ARTIFACT_MAIN_STAT_BY_ID).
//
// 100 = DEF — CONFERMATO al 100% incrociando il replay reale con uno
// screenshot vero (Gandalf/"Lucioxis", relic "Hearty Restore" +8→11% e
// +10→13%, estrapolato a +6→9% = combacia esatto con lo screenshot).
//
// 101/102 = HP/ATK — NON ancora confermati con uno screenshot 1:1 (la
// progressione valore-per-livello è identica per tutti e 3 i codici, quindi
// non si distingue da quella da sola). Assegnati per frequenza nel log
// (101 molto più comune di 102, coerente con build da difesa Siege dove
// HP è scelta comune e ATK è rara) — se mai arriva uno screenshot di una
// relic HP o ATK equipaggiata su un mostro presente nel log, si conferma
// o si corregge (basta invertire i due valori qui sotto).
export const RELIC_MAIN_STAT_BY_ID = {
  100: "DEF",
  101: "HP",
  102: "ATK",
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
