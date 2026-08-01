// Numeri usati nei log SWEX per gli artefatti -> traduzione leggibile.
// SOLO valori confermati a mano confrontando con screenshot veri del
// gioco (stessa tecnica usata per le rune) — meglio "sconosciuto" che un
// nome sbagliato scritto in un Counter vero.

// Statistica principale dell'artefatto (pri_effect[0]).
// CONFERMATO con 6 artefatti reali + screenshot in game della squadra
// Water Gandalf / Angela / Wind Nobara Kugisaki di Lucioxis:
//   Gandalf [102,100]x2  = "DEF +100" x2  -> 102 = DEF
//   Angela  [100,1500]x2 = "HP +1500" x2  -> 100 = HP
//   Nobara  [102,100] + [100,1500]        = conferma incrociata di entrambi
// 101 = ATK è l'unico non verificato direttamente (nessuno dei mostri
// controllati montava un artefatto ATK), ma è l'unico codice rimasto.
export const ARTIFACT_MAIN_STAT_BY_ID = {
  100: "HP",
  101: "ATK", // unico non ancora verificato con screenshot
  102: "DEF",
};

// pri_effect = [codice_stat, VALORE, livello, ...]. Il valore è già quello
// finale mostrato in game ([102,100,15] = "DEF +100", [100,1500,15] =
// "HP +1500"): non va diviso per il livello.
export function artifactMainStatValue(rawArtifact) {
  return rawArtifact?.pri_effect?.[1] ?? null;
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
  // Confermato il 01/08/2026 con screenshot reale (Water Artifact di
  // Mai__a__me): unica riga non riconosciuta su un artefatto con gli altri
  // 3 effetti già noti (214, 308, 224) — combaciava per esclusione.
  // Diverso da 226 "ATK/DEF UP Effect +" (quello tocca entrambe le stat).
  204: "ATK UP Effect +",
  // Confermato il 01/08/2026 con screenshot reale (HP Artifact di Arnold,
  // RedK9): stesso schema del 204 — unica riga non riconosciuta su un
  // artefatto con gli altri 3 effetti già noti (405, 407, 225).
  // Coppia pulita con 204/206: ATK UP, DEF UP, SPD UP separati, diversi dal
  // 226 "ATK/DEF UP Effect +" che li combina.
  205: "DEF UP Effect +",
  // Confermato il 01/08/2026 con screenshot reale (Attack Artifact di
  // Chilling, Mai_a_me): stesso schema di 204/205 — unica riga non
  // riconosciuta su un artefatto con gli altri 3 effetti già noti
  // (203, 221, 218). Completa la famiglia "X UP Effect": 204 ATK, 205 DEF,
  // 206 SPD (già noto), 207 CRIT Rate.
  207: "CRIT Rate UP Effect +",
  // Confermato il 01/08/2026 con screenshot reale (Support Artifact di
  // Chloe, z3v4n): stesso artefatto del 211, ordine grezzo confermato
  // dalle 2 righe note (405, 206) nella posizione attesa.
  213: "DMG taken w/ Inability -",
  206: "SPD UP Effect +",
  208: "Counterattack DMG +",
  209: "Co-op Attack DMG +",
  210: "Bomb DMG +",
  // Confermato il 01/08/2026 con screenshot reale (Support Artifact di
  // Chloe, z3v4n): comparso per caso mentre si cercava il 213 sullo stesso
  // artefatto. Ordine di visualizzazione = ordine grezzo dei sec_effects
  // (verificato: le altre 2 righe note, 405 e 206, comparivano nella
  // stessa posizione relativa attesa dai dati grezzi).
  211: "Reflected DMG +",
  212: "Crushing Hit DMG +",
  214: "CRIT DMG Taken -",
  215: "Life Drain +",
  // Confermato il 01/08/2026 con screenshot reale (HP Artifact di
  // Josephine, anto88): unica riga non riconosciuta su un artefatto con
  // gli altri 3 effetti già noti (219, 401, 405).
  216: "HP when Revived +",
  // Confermato il 01/08/2026 con screenshot reale (Light Artifact di
  // Groggo, GreedDaemon): unica riga non riconosciuta su un artefatto con
  // gli altri 3 effetti già noti (214, 309, 303). Famiglia "when revived"
  // insieme al 216, trovato nello stesso giro di controlli.
  217: "ATK Bar when Revived +",
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
  // Confermato il 01/08/2026 con screenshot reale (Attack Artifact di
  // Tarq/seconda awakening ID 10631, Mai__a__me): unica riga non
  // riconosciuta su un artefatto con gli altri 3 effetti già noti
  // (401, 206, 411). Completa la sequenza [Skill 1]/[Skill 2]/[Skill 3].
  402: "[Skill 3] CRIT DMG +",
  // Confermato il 01/08/2026 con screenshot reale (HP Artifact di
  // Mephisto, Rakyone) — ULTIMO codice rimasto aperto da stanotte.
  // Unica riga non riconosciuta su un artefatto con gli altri 3 effetti
  // già noti (215, 206, 201). Chiude la sequenza [Skill 1]-[Skill 4].
  403: "[Skill 4] CRIT DMG +",
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
