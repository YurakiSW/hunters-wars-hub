// Numeri usati nei log SWEX per le RELIC (7° slot, diverso dagli Artefatti:
// namespace di codici separato, NON riusare ARTIFACT_MAIN_STAT_BY_ID —
// anche se stavolta il codice DEF coincide con quello degli artefatti, per
// puro caso: 102 in entrambi).
//
// 102 = DEF — CORRETTO IL 30/07/2026 (seconda volta): la prima
// "conferma" (100=DEF) era su un mostro sbagliato (vedi nota identica in
// artifactEffects.js — un'unità con la stessa HP base di Gandalf ma
// ATK/DEF/SPD diversi, scambiata per lui per errore). Il vero Water
// Gandalf (con=790, atk=571, def=780, spd=100, stat base combacianti
// ESATTE con lo screenshot) ha relic con codice 102 e valore 9 — combacia
// esatto con lo screenshot originale ("+6 Hearty Restore Relic: DEF+9%").
//
// 100/101 = HP/ATK ANCORA NON confermati con uno screenshot 1:1 (la
// progressione valore-per-livello è identica per tutti e 3 i codici, quindi
// non si distingue da quella da sola) — placeholder, da confermare con
// uno screenshot di una relic HP o ATK su un mostro identificabile nel log.
export const RELIC_MAIN_STAT_BY_ID = {
  100: "HP", // non confermato
  101: "ATK", // non confermato
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
