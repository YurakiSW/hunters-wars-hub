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
export const ARTIFACT_LEFT_OPTIONS = [
  "Dmg dealt to Water", "Dmg dealt to Fire", "Dmg dealt to Wind", "Dmg dealt to Light", "Dmg dealt to Dark",
  "Dmg received from Water", "Dmg received from Fire", "Dmg received from Wind", "Dmg received from Light", "Dmg received from Dark",
  "ATK Increased Proportional to Lost HP", "DEF Increased Proportional to Lost HP", "SPD Increased Proportional to Lost HP",
  "Increase ATK Effect", "Increase DEF Effect", "Increase SPD Effect",
  "Dmg Dealt by Counterattack", "Dmg Dealt by Attacking Together",
  "Bomb Dmg", "Life Drain",
  "HP when Revived", "Attack Bar when Revived",
  "Additional Dmg by % of HP", "Additional Dmg by % of ATK", "Additional Dmg by % of DEF", "Additional Dmg by % of SPD",
  "Received CRIT DMG -%",
  "CRIT DMG+ vs enemy with high HP", "CRIT DMG+ vs enemy with low HP",
  "Single-target skill CRIT DMG (own turn)",
  "Increase CRIT Rate Effect", "SPD under Inability Effects", "Dmg Received under Inability Effects -%",
  "Dmg Dealt by Reflect DMG", "Crushing Hit DMG",
];

export const ARTIFACT_RIGHT_OPTIONS = [
  "S1 CRIT DMG", "S2 CRIT DMG", "S3 CRIT DMG", "S4 CRIT DMG",
  "S1 Recovery", "S2 Recovery", "S3 Recovery",
  "S1 Accuracy", "S2 Accuracy", "S3 Accuracy",
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
  return errors;
}
