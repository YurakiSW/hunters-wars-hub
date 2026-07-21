export const RUNE_SETS = [
  "Energy", "Guard", "Swift", "Blade", "Rage", "Focus", "Endure", "Fatal",
  "Will", "Despair", "Vampire", "Violent", "Nemesis", "Shield", "Revenge",
  "Destroy", "Fight", "Determination", "Enhance", "Accuracy", "Tolerance",
  "Seal", "Intangible",
].sort();

// Slot 1/3/5 sono fissi (ATK/DEF/HP flat) e non si scelgono.
export const SLOT2_OPTIONS = ["SPD", "ATK%", "ATK flat", "DEF%", "DEF flat", "HP%", "HP flat"];
export const SLOT4_OPTIONS = ["ATK%", "ATK flat", "DEF%", "DEF flat", "HP%", "HP flat", "CRIT Rate%", "CRIT DMG%"];
export const SLOT6_OPTIONS = ["ATK%", "ATK flat", "DEF%", "DEF flat", "HP%", "HP flat", "Resistance%", "Accuracy%"];

// Artefatto Sinistro = Attributo (elemento); Artefatto Destro = Tipo
// (classe, legato a skill specifiche). Pool diverse per regola di gioco.
// Elenchi verificati direttamente dagli screenshot del gioco (schermata
// "Sub Property Detailed Search"). Molte voci compaiono su ENTRAMBI i tipi
// di artefatto (es. Add'l DMG Prop., CD+ as Enemy HP, Life Drain...);
// solo quelle elementali sono esclusive dell'Attributo, e quelle legate
// alle skill sono esclusive del Tipo.
const ARTIFACT_SHARED_OPTIONS = [
  "Add'l DMG Prop. to HP", "Add'l DMG Prop. to ATK", "Add'l DMG Prop. to DEF", "Add'l DMG Prop. to SPD",
  "ATK/DEF UP Effect +", "SPD UP Effect +",
  "CD+ as Enemy HP is More", "CD+ as Enemy HP is Less", "Own Turn 1-target CD+",
  "Counterattack/Co-op Attack DMG +", "Bomb DMG +", "CRIT DMG Taken -", "Life Drain +",
];

export const ARTIFACT_LEFT_OPTIONS = [
  "DMG dealt on Fire +", "DMG dealt on Water +", "DMG dealt on Wind +", "DMG dealt on Light +", "DMG dealt on Dark +",
  "DMG taken from Fire -", "DMG taken from Water -", "DMG taken from Wind -", "DMG taken from Light -", "DMG taken from Dark -",
  ...ARTIFACT_SHARED_OPTIONS,
];

export const ARTIFACT_RIGHT_OPTIONS = [
  "[Skill 1] CRIT DMG +", "[Skill 2] CRIT DMG +", "[Skill 3/4] CRIT DMG +", "First Attack CRIT DMG +",
  "[Skill 1] Recovery +", "[Skill 2] Recovery +", "[Skill 3] Recovery +",
  "[Skill 1] Accuracy +", "[Skill 2] Accuracy +", "[Skill 3] Accuracy +",
  ...ARTIFACT_SHARED_OPTIONS,
];

export const MAX_ARTIFACT_STATS = 6;

export function validateUnit(u) {
  const errors = [];
  if (!u.name?.trim()) errors.push("nome mostro mancante");
  if (!u.runes?.trim()) errors.push("rune mancanti");
  if (!u.stats || u.stats.split("/").map((p) => p.trim()).filter(Boolean).length !== 3) errors.push("priorità statistiche incomplete (servono slot 2, 4 e 6)");
  if (!u.artifactLeft?.length) errors.push("artefatto attributo mancante");
  if (!u.artifactRight?.length) errors.push("artefatto tipo mancante");
  if (u.artifactLeft?.length > MAX_ARTIFACT_STATS || u.artifactRight?.length > MAX_ARTIFACT_STATS) errors.push("massimo 6 stat per artefatto");
  if (!u.notes?.some((n) => n?.trim())) errors.push("note mancanti");
  return errors;
}

export function validateCounterPayload(payload) {
  const errors = [];
  if (!payload.units || payload.units.length < 2) errors.push("servono almeno 2 mostri in squadra");
  (payload.units || []).forEach((u, i) => {
    const unitErrors = validateUnit(u);
    if (unitErrors.length) errors.push(`mostro ${i + 1}: ${unitErrors.join(", ")}`);
  });
  const unitNames = (payload.units || []).map((u) => u.name?.trim()).filter(Boolean);
  const turnOrder = payload.turnOrder || [];
  if (turnOrder.length !== unitNames.length || new Set(turnOrder).size !== unitNames.length) {
    errors.push("ordine turni incompleto o con duplicati");
  }
  if (!payload.focus?.length) errors.push("focus priority mancante");
  if (!payload.strategy?.trim()) errors.push("strategia mancante");
  if (payload.images?.length > 6) errors.push("massimo 6 immagini per counter");
  return errors;
}
