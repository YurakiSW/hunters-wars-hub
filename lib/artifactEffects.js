// Numeri usati nei log SWEX per gli artefatti -> traduzione leggibile.
// SOLO valori confermati a mano confrontando con screenshot veri del
// gioco (stessa tecnica usata per le rune) — meglio "sconosciuto" che un
// nome sbagliato scritto in un Counter vero.

// Statistica principale dell'artefatto (pri_effect[0]).
// ATTENZIONE — CORRETTO IL 30/07/2026 (seconda volta): la prima
// "correzione" di stasera (100=DEF) era basata su un mostro identificato
// MALE — avevo trovato un'unità con la stessa HP base (con=790) di Gandalf
// ma ATK/DEF/SPD diversi, scambiandola per lui. Il vero Water Gandalf
// (con=790, atk=571, def=780, spd=100 — le 4 stat base combaciano ESATTE
// con lo screenshot reale) ha ENTRAMBI gli artefatti con codice 102, e
// Flora conferma a voce che sono entrambi DEF — quindi il codice giusto
// è 102 = DEF, non 100.
// 100/101 = HP/ATK ANCORA NON distinti con certezza (serve uno screenshot
// reale di Angela o Aya con lo unit_master_id giusto per chiuderli, stessa
// tecnica usata per DEF) — lasciati come placeholder.
export const ARTIFACT_MAIN_STAT_BY_ID = {
  100: "HP", // non confermato
  101: "ATK", // non confermato
  102: "DEF",
};

// Il valore vero non è pri_effect[1] direttamente: va diviso per il
// livello dell'artefatto (pri_effect[2], = campo "level") — verificato:
// entrambi gli artefatti di Water Gandalf hanno pri_effect [102, 1500, 15,
// ...] e livello 15 in game, e 1500/15 = 100, esattamente "DEF +100".
export function artifactMainStatValue(rawArtifact) {
  const eff = rawArtifact?.pri_effect;
  if (!eff || eff[2] == null || eff[2] === 0) return null;
  return eff[1] / eff[2];
}

export function artifactMainStatFromCode(code) {
  return ARTIFACT_MAIN_STAT_BY_ID[code] ?? null;
}

// Elemento a cui è legato un Artefatto Attributo (campo "attribute").
// 98 = nessun elemento specifico (artefatti "speciali/leggendari").
// Tabella COMPLETA — verificata al 100% confrontando 12 screenshot con
// l'export account reale (Yuraki-222186.json), 27/07/2026.
export const ARTIFACT_ATTRIBUTE_ELEMENT_BY_ID = {
  1: "Water",
  2: "Fire",
  3: "Wind",
  4: "Light",
  5: "Dark",
  98: null,
};

// Effetti secondari (sec_effects[i][0]) — stessa dicitura esatta già usata
// in lib/gameData.js per ARTIFACT_LEFT_OPTIONS/ARTIFACT_RIGHT_OPTIONS,
// così il testo importato dal log combacia con quello scelto a mano.
export const ARTIFACT_EFFECT_BY_ID = {
  200: "ATK+ Prop. to Lost HP",
  201: "DEF+ Prop. to Lost HP",
  202: "SPD+ Prop. to Lost HP",
  203: "SPD w/ Inability +",
  206: "SPD UP Effect +",
  208: "Counterattack DMG +",
  209: "Co-op Attack DMG +",
  210: "Bomb DMG +",
  212: "Crushing Hit DMG +",
  214: "CRIT DMG Taken -",
  215: "Life Drain +",
  218: "Add'l DMG Prop. to HP",
  219: "Add'l DMG Prop. to ATK",
  220: "Add'l DMG Prop. to DEF",
  221: "Add'l DMG Prop. to SPD",
  222: "CD+ as Enemy HP is More",
  223: "CD+ as Enemy HP is Less",
  224: "Own Turn 1-target CD+",
  225: "Counterattack/Co-op Attack DMG +",
  226: "ATK/DEF UP Effect +",
  300: "DMG dealt on Fire +",
  301: "DMG dealt on Water +",
  302: "DMG dealt on Wind +",
  303: "DMG dealt on Light +",
  304: "DMG dealt on Dark +",
  305: "DMG taken from Fire -",
  306: "DMG taken from Water -",
  307: "DMG taken from Wind -",
  308: "DMG taken from Light -",
  309: "DMG taken from Dark -",
  400: "[Skill 1] CRIT DMG +",
  401: "[Skill 2] CRIT DMG +",
  404: "[Skill 1] Recovery +",
  405: "[Skill 2] Recovery +",
  406: "[Skill 3] Recovery +",
  407: "[Skill 1] Accuracy +",
  408: "[Skill 2] Accuracy +",
  409: "[Skill 3] Accuracy +",
  410: "[Skill 3/4] CRIT DMG +",
  411: "First Attack CRIT DMG +",
};

export function describeArtifactEffect(code) {
  return ARTIFACT_EFFECT_BY_ID[code] || `Effetto sconosciuto (ID: ${code})`;
}

// Prende gli artefatti grezzi di UN mostro (0-2, dal replay) e li smista
// nei due elenchi già usati dal sito: artifactLeft (Attributo, type=1) e
// artifactRight (Tipo, type=2) — ognuno con i suoi sec_effects tradotti,
// PIÙ il main stat (HP/ATK/DEF) di ciascuno dei due, da mostrare al player
// insieme alla lista degli effetti (richiesta: "deve dire cosa sia
// l'artefatto usato nel log, se DEF, ATK o HP").
export function describeUnitArtifacts(rawArtifacts) {
  const artifactLeft = [];
  const artifactRight = [];
  let artifactLeftMainStat = null;
  let artifactRightMainStat = null;
  for (const art of rawArtifacts || []) {
    const isLeft = art.type === 1;
    const target = isLeft ? artifactLeft : art.type === 2 ? artifactRight : null;
    if (!target) continue;
    const mainStat = artifactMainStatFromCode(art?.pri_effect?.[0]);
    if (isLeft) artifactLeftMainStat = mainStat;
    else artifactRightMainStat = mainStat;
    for (const sec of art.sec_effects || []) {
      target.push(describeArtifactEffect(sec[0]));
    }
  }
  return { artifactLeft, artifactRight, artifactLeftMainStat, artifactRightMainStat };
}
