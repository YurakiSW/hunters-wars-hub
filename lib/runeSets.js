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

// Trasforma i 6 set_id di un mostro (uno per slot) nella stessa notazione
// già usata nel sito per il campo Rune (es. "Violent / Nemesis") — un nome
// per ogni set DIVERSO presente, senza ripeterlo, nell'ordine in cui
// compare la prima volta.
export function describeRuneSets(setIds) {
  const seen = [];
  for (const id of setIds || []) {
    const name = RUNE_SET_BY_ID[id] || `Set sconosciuto (ID: ${id})`;
    if (!seen.includes(name)) seen.push(name);
  }
  return seen.join(" / ");
}
