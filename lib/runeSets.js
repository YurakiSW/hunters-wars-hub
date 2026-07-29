// Numero set (set_id, come arriva dai log SWEX) -> nome del set di rune.
// Tabella COMPLETA (tutti e 23 i set), verificata confrontando il
// conteggio delle rune nell'inventario reale con quello estratto dai dati
// — ogni numero combacia esattamente, nessuna ambiguità.
export const RUNE_SET_BY_ID = {
  1: "Energy",
  2: "Guard",
  3: "Swift",
  4: "Blade",
  5: "Rage",
  6: "Focus",
  7: "Endure",
  8: "Fatal",
  10: "Despair",
  11: "Vampire",
  13: "Violent",
  14: "Nemesis",
  15: "Will",
  16: "Shield",
  17: "Revenge",
  18: "Destroy",
  19: "Fight",
  20: "Determination",
  21: "Enhance",
  22: "Accuracy",
  23: "Tolerance",
  24: "Seal",
  25: "Intangible",
};

// Numero stat (pri_eff[0]/sec_eff[0], come arriva dai log SWEX) -> nome
// stat leggibile, con la STESSA dicitura già usata dai menu a tendina del
// sito (lib/gameData.js SLOT2/4/6_OPTIONS). 2,5,6,8,9,10,11,12 verificati
// 1:1 confrontando screenshot reali di rune con l'export (29/07/2026,
// tripla conferma incrociata per ognuno). 1,3,4 confermati indirettamente:
// gli slot 1/3/5 sono SEMPRE ATK/DEF/HP flat per convenzione di gioco (mai
// variabili), e un replay vero mostra esattamente questi codici in quelle
// posizioni fisse — coerente al 100% con lo schema degli altri 8.
export const RUNE_STAT_BY_ID = {
  1: "HP flat",
  2: "HP%",
  3: "ATK flat",
  4: "ATK%",
  5: "DEF flat",
  6: "DEF%",
  8: "SPD",
  9: "CRIT Rate%",
  10: "CRIT DMG%",
  11: "Resistance%",
  12: "Accuracy%",
};

function runeStatLabel(code) {
  return RUNE_STAT_BY_ID[code] || `Stat sconosciuta (ID: ${code})`;
}

// Prende le 6 rune grezze di un mostro (dal replay, con slot_no + pri_eff)
// e produce la stringa "stats" nello stesso formato già usato dal sito per
// l'inserimento manuale (es. "SPD / HP% / Accuracy%" — slot 2 / 4 / 6).
export function describeRuneMainStats(rawRunes) {
  const bySlot = {};
  for (const r of rawRunes || []) {
    if (r?.slot_no) bySlot[r.slot_no] = r;
  }
  const parts = [2, 4, 6].map((slot) => {
    const r = bySlot[slot];
    return r?.pri_eff ? runeStatLabel(r.pri_eff[0]) : "";
  });
  if (parts.every((p) => !p)) return "";
  return parts.join(" / ");
}

// Trasforma i 6 set_id di un mostro (uno per slot) nella stessa notazione
// già usata nel sito per il campo Rune (es. "Violent / Nemesis") — un nome
// per ogni set DIVERSO presente, senza ripeterlo, nell'ordine in cui
// compare la prima volta.
export function describeRuneSets(rawRunes) {
  const seen = [];
  for (const r of rawRunes || []) {
    const id = typeof r === "object" ? r?.set_id : r; // compatibile sia col nuovo formato (oggetto runa) sia col vecchio (solo set_id)
    const name = RUNE_SET_BY_ID[id] || `Set sconosciuto (ID: ${id})`;
    if (!seen.includes(name)) seen.push(name);
  }
  return seen.join(" / ");
}
