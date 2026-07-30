import { artifactMainStatFromCode, artifactMainStatValue } from "./artifactEffects";
import { relicMainStatFromCode, relicMainStatValue } from "./relicEffects";

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

// Base fissa di gioco (mai cambiata, stessa per ogni mostro): CRIT Rate
// 15%, CRIT Dmg 50%, Accuracy 0%. HP/ATK/DEF/SPD/Resistance invece non
// hanno bisogno di calcolo: arrivano già finali (con tutto: rune, set,
// artefatti, leader, torri) direttamente dal replay.
const BASE_CRIT_RATE = 15;
const BASE_CRIT_DMG = 50;
const BASE_ACCURACY = 0;

// Bonus dei SET completi che toccano CRIT Rate/Dmg/Accuracy — gli unici 3
// set rilevanti per questi 3 numeri, verificati con screenshot reali il
// 29-30/07/2026 (Blade 2pz, Rage 4pz, Focus 2pz — tutti gli altri set
// confermati stasera non toccano nessuna di queste 3 stat).
const SET_BONUS_CRIT_ACC = {
  4: { threshold: 2, key: "critRate", value: 12 }, // Blade
  5: { threshold: 4, key: "critDmg", value: 40 }, // Rage
  6: { threshold: 2, key: "accuracy", value: 20 }, // Focus
};

// Prende rune/artefatti/relic grezzi + le stat base pure dal replay, e
// restituisce il blocco "COMBAT STATS" completo per un mostro.
//
// IMPORTANTE (corretto il 30/07/2026): il replay NON dà mai le stat finali
// già calcolate (a differenza di quanto si pensava prima) — dà SOLO la
// stat base pura (vedi combatBase). HP/ATK/DEF/SPD/Resistance vanno quindi
// sommati a mano qui, esattamente come già si faceva per CRIT/Accuracy.
//
// Formula (verificata al 100% sui 6 screenshot rune + 2 artefatti + relic
// reali di Lucioxis, 30/07/2026 — combacia esatto con la scheda in game su
// OGNI stat: HP 36267, ATK 926, DEF 2071, SPD 244, Resistance 59%):
//   HP/ATK/DEF  = base_convertita × (1 + %tot/100) + flat_tot
//                 (dove %tot include anche il bonus % della relic se il
//                 suo main stat è quella stessa stat; flat_tot include
//                 anche il bonus flat degli artefatti se il loro main
//                 stat è quella stessa stat)
//   SPD         = base + flat_tot rune (mai % per SPD, mai da artefatti/relic)
//   Resistance  = base + %tot rune (mai da artefatti/relic — non hanno
//                 mai Resistance come main stat)
//   HP ha in più la conversione base×15 (con → HP vera): unica stat con
//   un fattore di scala diverso da 1, verificato con la formula inversa
//   (con=790 → 790×15=11850, combacia col bianco mostrato in game).
export function computeCombatStats(rawRunes, combatBase, rawArtifacts, rawRelics) {
  if (!combatBase) return null;
  let critRate = BASE_CRIT_RATE;
  let critDmg = BASE_CRIT_DMG;
  let accuracy = BASE_ACCURACY;
  const setCounts = {};

  // Percentuali/flat da sommare per HP/ATK/DEF/SPD/Resistance.
  const pct = { hp: 0, atk: 0, def: 0, resistance: 0 };
  const flat = { hp: 0, atk: 0, def: 0, spd: 0 };

  for (const r of rawRunes || []) {
    if (r?.set_id) setCounts[r.set_id] = (setCounts[r.set_id] || 0) + 1;
    const effects = [r?.pri_eff, r?.prefix_eff, ...(r?.sec_eff || [])].filter(Boolean);
    for (const eff of effects) {
      const code = eff[0], value = eff[1];
      if (code === 9) critRate += value;
      else if (code === 10) critDmg += value;
      else if (code === 12) accuracy += value;
      else if (code === 1) flat.hp += value;
      else if (code === 2) pct.hp += value;
      else if (code === 3) flat.atk += value;
      else if (code === 4) pct.atk += value;
      else if (code === 5) flat.def += value;
      else if (code === 6) pct.def += value;
      else if (code === 8) flat.spd += value;
      else if (code === 11) pct.resistance += value;
    }
  }
  for (const [setId, bonus] of Object.entries(SET_BONUS_CRIT_ACC)) {
    const stacks = Math.floor((setCounts[setId] || 0) / bonus.threshold);
    if (stacks > 0) {
      if (bonus.key === "critRate") critRate += bonus.value * stacks;
      else if (bonus.key === "critDmg") critDmg += bonus.value * stacks;
      else if (bonus.key === "accuracy") accuracy += bonus.value * stacks;
    }
  }

  // Artefatti: main stat SEMPRE flat (0-2 per mostro).
  const statFlatKey = { HP: "hp", ATK: "atk", DEF: "def" };
  for (const art of rawArtifacts || []) {
    const statName = artifactMainStatFromCode(art?.pri_effect?.[0]);
    const value = artifactMainStatValue(art);
    const key = statFlatKey[statName];
    if (key && value != null) flat[key] += value;
  }

  // Relic: main stat SEMPRE percentuale, massimo 1 per mostro.
  const relic = rawRelics?.[0];
  const relicStatName = relicMainStatFromCode(relic?.pri_effect?.[0]);
  const relicValue = relicMainStatValue(relic);
  const statPctKey = { HP: "hp", ATK: "atk", DEF: "def" };
  const relicKey = statPctKey[relicStatName];
  if (relicKey && relicValue != null) pct[relicKey] += relicValue;

  const hpBase = combatBase.hp != null ? combatBase.hp * 15 : null;
  const round = (n) => (n == null ? null : Math.round(n));

  return {
    hp: round(hpBase != null ? hpBase * (1 + pct.hp / 100) + flat.hp : null),
    atk: round(combatBase.atk != null ? combatBase.atk * (1 + pct.atk / 100) + flat.atk : null),
    def: round(combatBase.def != null ? combatBase.def * (1 + pct.def / 100) + flat.def : null),
    spd: round(combatBase.spd != null ? combatBase.spd + flat.spd : null),
    critRate, critDmg,
    resistance: round(combatBase.resistance != null ? combatBase.resistance + pct.resistance : null),
    accuracy,
  };
}
