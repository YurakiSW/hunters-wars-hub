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
// set rilevanti per questi 3 numeri (Blade 2pz, Rage 4pz, Focus 2pz),
// verificati con screenshot reali; nessun altro set tocca queste stat.
const SET_BONUS_CRIT_ACC = {
  4: { threshold: 2, key: "critRate", value: 12 }, // Blade
  5: { threshold: 4, key: "critDmg", value: 40 }, // Rage
  6: { threshold: 2, key: "accuracy", value: 20 }, // Focus
};

// Bonus SPD delle torri di gilda. Non compare MAI sulla scheda del mostro
// (né in game né nel replay), ma si applica sempre in battaglia — quindi
// serve per l'ordine turni vero, non per il blocco Combat Stats mostrato.
// 15% è il valore a torre completa, uguale per tutti i membri della gilda.
const TOWER_SPD_BONUS_PCT = 15;

// Nome stat (come lo restituiscono artifactMainStatFromCode /
// relicMainStatFromCode) -> chiave interna usata nei totali qui sotto.
const STAT_KEY = { HP: "hp", ATK: "atk", DEF: "def" };

// Prende rune/artefatti/relic grezzi + le stat base pure dal replay e
// restituisce il blocco "COMBAT STATS" completo per un mostro.
//
// Il replay dà SOLO le stat base della specie (combatBase), mai i totali
// finali: vanno ricostruiti tutti qui. Formula, verificata al 100% su 24
// stat reali (Water Gandalf + Angela + Wind Nobara Kugisaki di Lucioxis,
// confronto 1:1 con gli screenshot in game, zero scarti):
//
//   HP/ATK/DEF  = base + ceil(base × %tot / 100) + flat_tot
//   SPD         = base + flat rune            (SPD non ha mai bonus %)
//   Resistance  = base + % rune               (mai da artefatti/relic)
//   CRIT/Acc    = base specie + rune + bonus set
//
// Dettagli non ovvi, tutti confermati sui dati reali:
//   - HP base va moltiplicata ×15 (il replay salva `con`, non l'HP vera)
//   - la parte % si arrotonda per ECCESSO, il totale no (vedi sotto)
//   - artefatti = sempre bonus FLAT; relic = sempre bonus PERCENTUALE
//   - baseAccuracy arriva da swarfarm: è l'unica stat base che il replay
//     non contiene, e non è 0 per tutti (es. Wind Nobara Kugisaki 25%)
export function computeCombatStats(rawRunes, combatBase, rawArtifacts, rawRelics, baseAccuracy) {
  if (!combatBase) return null;
  let critRate = BASE_CRIT_RATE;
  let critDmg = BASE_CRIT_DMG;
  // Accuracy base: quasi sempre 0, ma alcuni mostri partono da un valore
  // proprio (es. Wind Nobara Kugisaki 25%). Arriva da swarfarm perché il
  // replay non la contiene; se manca il dato si usa 0 come prima.
  let accuracy = baseAccuracy ?? BASE_ACCURACY;
  const setCounts = {};

  // Percentuali/flat da sommare per HP/ATK/DEF/SPD/Resistance.
  const pct = { hp: 0, atk: 0, def: 0, resistance: 0 };
  const flat = { hp: 0, atk: 0, def: 0, spd: 0 };

  // Ogni effetto è [codice, valore, flag_enchant, VALORE_GRIND]: il quarto
  // elemento è il bonus da pietra di rifinitura e va SEMPRE sommato al
  // secondo (prima veniva ignorato, e HP/ATK/DEF/SPD uscivano più bassi del
  // reale). Sulle stat dove il grind non esiste (CRIT Rate/Dmg, Resistance,
  // Accuracy) il gioco scrive 0, quindi sommarlo è sicuro ovunque.
  for (const r of rawRunes || []) {
    if (r?.set_id) setCounts[r.set_id] = (setCounts[r.set_id] || 0) + 1;
    const effects = [r?.pri_eff, r?.prefix_eff, ...(r?.sec_eff || [])].filter(Boolean);
    for (const eff of effects) {
      const code = eff[0], value = (eff[1] || 0) + (eff[3] || 0);
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
  for (const art of rawArtifacts || []) {
    const key = STAT_KEY[artifactMainStatFromCode(art?.pri_effect?.[0])];
    const value = artifactMainStatValue(art);
    if (key && value != null) flat[key] += value;
  }

  // Relic: main stat SEMPRE percentuale, massimo 1 per mostro.
  const relic = rawRelics?.[0];
  const relicKey = STAT_KEY[relicMainStatFromCode(relic?.pri_effect?.[0])];
  const relicValue = relicMainStatValue(relic);
  if (relicKey && relicValue != null) pct[relicKey] += relicValue;

  const hpBase = combatBase.hp != null ? combatBase.hp * 15 : null;
  // Regola di arrotondamento VERA del gioco (verificata su 9 stat di 3
  // mostri diversi con screenshot in game): la parte percentuale si
  // arrotonda per ECCESSO e si somma a base e piatto — non si arrotonda il
  // totale. Con Math.round() sul totale, 4 valori su 9 uscivano più bassi
  // di 1 punto rispetto al gioco; così combaciano tutti e 9.
  const withPct = (base, pctVal, flatVal) =>
    base == null ? null : base + Math.ceil((base * pctVal) / 100) + flatVal;

  return {
    hp: withPct(hpBase, pct.hp, flat.hp),
    atk: withPct(combatBase.atk, pct.atk, flat.atk),
    def: withPct(combatBase.def, pct.def, flat.def),
    // `spd` = quella della scheda mob (senza torri), per il blocco Combat
    // Stats mostrato all'utente: deve combaciare con quello che vede in game.
    spd: combatBase.spd != null ? combatBase.spd + flat.spd : null,
    // `spdCombat` = quella vera in battaglia (torre applicata alla sola SPD
    // base, poi si somma la SPD da rune+grind). È QUESTA che determina
    // l'ordine turni. Verificata su 3 mostri reali: 259 / 288 / 244.
    spdCombat: withPct(combatBase.spd, TOWER_SPD_BONUS_PCT, flat.spd),
    critRate, critDmg,
    resistance: combatBase.resistance != null ? combatBase.resistance + pct.resistance : null,
    accuracy,
  };
}

// ===== Efficienza rune =====
// Formula standard del gioco (la stessa usata da swarfarm/SWOP):
//   efficienza = (principale/suo max  +  Σ sotto-stat/(max di un tiro × 5)) / 2.8
// Una rune teoricamente perfetta arriva a 5/2.8 = 178,6%, quindi "sopra
// 100%" è già ottima. Le macine (grindstone) sono INCLUSE: misuriamo quanto
// è forte la rune adesso in battaglia, che è ciò che conta per una Siege.

// Valore massimo della stat PRINCIPALE a +15 su rune 6★.
const MAX_MAIN_STAT_6 = {
  1: 2448, 2: 63, 3: 160, 4: 63, 5: 160, 6: 63,
  8: 42, 9: 58, 10: 80, 11: 64, 12: 64,
};
// Valore massimo di UN singolo tiro di sotto-stat su rune 6★.
const MAX_SUBSTAT_ROLL_6 = {
  1: 375, 2: 8, 3: 20, 4: 8, 5: 20, 6: 8,
  8: 6, 9: 6, 10: 7, 11: 8, 12: 8,
};

// Efficienza di UNA rune, in percentuale. null se i dati non bastano.
export function runeEfficiency(rune) {
  if (!rune?.pri_eff) return null;
  const [mainId, mainVal] = rune.pri_eff;
  const maxMain = MAX_MAIN_STAT_6[mainId];
  if (!maxMain || typeof mainVal !== "number") return null;

  let sum = mainVal / maxMain;
  for (const sec of rune.sec_eff || []) {
    const [statId, value, , grind] = sec || [];
    const maxRoll = MAX_SUBSTAT_ROLL_6[statId];
    if (!maxRoll || typeof value !== "number") continue;
    sum += (value + (typeof grind === "number" ? grind : 0)) / (maxRoll * 5);
  }
  return (sum / 2.8) * 100;
}

// Efficienza media di un mostro (le sue 6 rune). null se non ne ha nessuna
// leggibile — non 0, altrimenti un mostro senza dati sembrerebbe pessimo
// invece che "sconosciuto".
export function unitRuneEfficiency(rawRunes) {
  if (!Array.isArray(rawRunes) || !rawRunes.length) return null;
  const vals = rawRunes.map(runeEfficiency).filter((v) => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// Efficienza media di una squadra (i primi 3 mostri). Serve come spareggio
// quando due build hanno le stesse vittorie: a parità di risultati, vince
// chi ha la squadra runata meglio.
export function teamRuneEfficiency(units) {
  if (!Array.isArray(units)) return null;
  const vals = units.slice(0, 3).map((u) => unitRuneEfficiency(u?.rawRunes)).filter((v) => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
