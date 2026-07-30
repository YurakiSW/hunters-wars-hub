export const RUNE_SETS = [
  "Energy", "Guard", "Swift", "Blade", "Rage", "Focus", "Endure", "Fatal",
  "Will", "Despair", "Vampire", "Violent", "Nemesis", "Shield", "Revenge",
  "Destroy", "Fight", "Determination", "Enhance", "Accuracy", "Tolerance",
  "Seal", "Intangible", "Broken",
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

// Relic (7° slot): per ora tracciamo solo il main stat, facoltativo — NON
// obbligatorio in validateUnit, a differenza degli artefatti.
export const RELIC_MAIN_STAT_OPTIONS = ["HP", "ATK", "DEF"];

// Il campo "stats" di una unit è una stringa tipo "SPD/HP / CRIT DMG% / Accuracy%"
// — 3 slot (2, 4, 6) separati da " / " (con spazi), ognuno con 1+ valori
// separati da "/" senza spazi — stessa convenzione usata in gioco (es. "SPD/HP").
export function parseStatsString(str) {
  const slotParts = (str || "").split(" / ").map((s) => s.trim());
  return [0, 1, 2].map((i) => (slotParts[i] || "").split("/").map((v) => v.trim()).filter(Boolean));
}

export function serializeStatsSlots(slots) {
  const parts = slots.map((arr) => arr.filter(Boolean).join("/"));
  if (parts.every((p) => !p)) return "";
  return parts.join(" / ");
}

export function validateUnit(u) {
  const errors = [];
  if (!u.name?.trim()) errors.push("Nome mostro mancante");
  if (u.statsFlexible) {
    // "Set libero": non interessa quale set di rune usi, basta che arrivi
    // alle stat scritte — quindi qui il set NON è più obbligatorio.
    if (!u.statsMinText?.trim()) errors.push("Priorità statistiche: hai spuntato \"set libero\" ma non hai scritto le stat minime richieste");
  } else {
    if (!u.runes?.trim()) errors.push("Rune mancanti");
    const slots = parseStatsString(u.stats);
    if (slots.some((arr) => arr.length === 0)) {
      errors.push("Priorità statistiche incomplete (serve almeno una stat per slot 2, 4 e 6, oppure spunta \"set libero\")");
    }
  }
  if (!u.artifactLeft?.length) errors.push("Artefatto Attributo mancante");
  if (!u.artifactRight?.length) errors.push("Artefatto Tipo mancante");
  if (u.artifactLeft?.length > MAX_ARTIFACT_STATS || u.artifactRight?.length > MAX_ARTIFACT_STATS) errors.push("Massimo 6 stat per artefatto");
  return errors;
}

export function validateCounterPayload(payload) {
  const errors = [];
  if (!payload.units || payload.units.length < 2) errors.push("Servono almeno 2 mostri in squadra");
  (payload.units || []).forEach((u, i) => {
    const unitErrors = validateUnit(u);
    if (unitErrors.length) {
      const label = u.name?.trim() ? `"${u.name.trim()}"` : `mostro ${i + 1}`;
      errors.push(`${label} → ${unitErrors.join("; ")}`);
    }
  });
  const unitNames = (payload.units || []).slice(0, 3).map((u) => u.name?.trim()).filter(Boolean);
  const turnOrder = payload.turnOrder || [];
  if (turnOrder.length !== unitNames.length || new Set(turnOrder).size !== unitNames.length) {
    errors.push("Ordine turni (Speed Tuning) incompleto o con duplicati");
  }
  if (payload.images?.length > 6) errors.push("Massimo 6 immagini per counter");
  return errors;
}
