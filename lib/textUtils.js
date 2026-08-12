// Utility di testo senza dipendenze — usabile sia lato server (lib/) che
// lato client (components/), a differenza di lib/monsters.js e lib/roster.js
// che importano Redis e quindi non possono girare nel browser.

// Toglie accenti e uniforma maiuscole/minuscole per confrontare nomi
// mostro: "Irène" = "irene". A differenza di normalizeNickname (roster.js),
// NON toglie spazi/simboli — "Water Nobara" deve restare distinguibile da
// "Wind Nobara", solo l'accento non deve contare.
// I Counter/Difese caricati in blocco da Stats.xlsx hanno l'autore scritto
// come "Import Stats (Yuraki)" — più pulito mostrarli semplicemente come
// "Admin" ovunque compaiano, senza dover cambiare i dati salvati.
export function displayAuthorName(name) {
  return /^Import (Stats|Log)/i.test(name || "") ? "Admin" : name;
}

// Etichetta dell'autore di un Counter, nel formato concordato:
//   - importato da log:  "Siege Log Lucioxis"  (o solo "Siege Log" se il
//     nick di chi l'ha giocato non è disponibile — vale per gli import
//     fatti prima che estraessimo il campo dal replay)
//   - creato a mano:     "Yuraki"              (senza "proposto da")
// Restituisce la sola stringa: la formattazione grafica (formatNickname,
// colore manager) resta a carico di chi la mostra.
export function counterAuthorLabel(counter) {
  const author = displayAuthorName(counter?.authorNickname);
  if (/^Siege Log$/i.test(counter?.authorNickname || "")) {
    const base = counter?.logOwnerNickname ? `Siege Log ${counter.logOwnerNickname}` : "Siege Log";
    // Segnalare la correzione umana è utile: dice che quei dati sono stati
    // vagliati da qualcuno e non arrivano pari pari dal replay.
    return counter?.manuallyEdited
      ? `${base} · corretto${counter.editedByNickname ? ` da ${counter.editedByNickname}` : ""}`
      : base;
  }
  return author;
}

// Risolve il nome di un mostro al suo "canonico", unificando le versioni
// collab e non-collab dello stesso mostro (es. Water Gandalf e Old Wood
// sono lo stesso kit con due skin). `canonicalMap` è la mappa normalizzata
// prodotta da getCanonicalNameMap() in lib/monsters.js; se manca (o il
// mostro non è in nessuna coppia) il nome resta invariato.
// Funzione pura apposta: sta qui e non in monsters.js perché serve anche
// lato client, dove Redis non esiste.
export function canonicalMonsterName(name, canonicalMap) {
  if (!canonicalMap) return name;
  return canonicalMap.get(normalizeMonsterName(name)) || name;
}

export function normalizeMonsterName(s) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// Nome leggibile del grado di gilda, invece del numero nudo.
const GRADE_LABELS = { 1: "Guild Master", 2: "Player", 3: "Vice GM", 4: "Senior" };
export function gradeLabel(grade) {
  return GRADE_LABELS[grade] || "—";
}

// Chi è Revisore Counters o Admin SUL SITO (a prescindere dal ruolo in
// game) si vede il nickname circondato da stelline ovunque compaia, come
// segno distintivo — es. "✦Rex✦".
export function formatNickname(nickname, isManager) {
  if (!nickname) return "";
  return isManager ? `✦${nickname}✦` : nickname;
}

// Testo pronto da incollare in chat esterna (WhatsApp usa *asterischi* per
// il grassetto, non tag HTML). Unica funzione condivisa da Counter e Deck:
// prima era duplicata riga per riga in app/defs/[id]/page.js e
// app/deck-build/page.js — unificata il 12/08/2026 (Flora) così un ritocco
// al formato si fa in un posto solo e i due non possono più divergere.
//
// `team`: { units, lead, offense?, turnOrder?, focus? } — offense/focus
// esistono solo sui Counter, i Deck non li hanno e vengono semplicemente
// omessi. Ogni pezzo mancante (rune, artefatti, stat) sparisce dal testo
// invece di comparire vuoto.
export function formatTeamForChat(team) {
  const main = (team.units || []).slice(0, 3);
  const names = team.offense?.length ? team.offense : main.map((u) => u.name);
  const leadName = team.lead || main.find((u) => u.lead)?.name || null;

  const lines = [`⚔️ ${names.join(" / ")}`];
  if (leadName) lines.push(`👑 Lead: ${leadName}`);
  lines.push("");

  main.forEach((u, i) => {
    const runes = u.statsFlexible ? "Set libero" : u.runes || null;
    const rawStats = u.statsFlexible ? (u.statsMinText ? `+ ${u.statsMinText}` : null) : u.stats || null;
    const stats = rawStats ? rawStats.replace(/Accuracy%/g, "ACC%") : null;
    const line = [runes, stats].filter(Boolean).join(" — ");
    lines.push(line ? `*${u.name}*: ${line}` : `*${u.name}*`);

    if (u.artifactLeft?.length) {
      lines.push(`   Art. Attributo${u.artifactLeftMainStat ? ` (${u.artifactLeftMainStat})` : ""}: ${u.artifactLeft.join(", ")}`);
    }
    if (u.artifactRight?.length) {
      lines.push(`   Art. Tipo${u.artifactRightMainStat ? ` (${u.artifactRightMainStat})` : ""}: ${u.artifactRight.join(", ")}`);
    }

    const cs = u.combatStats;
    if (cs && Object.values(cs).some((v) => v != null)) {
      const bits = [
        cs.hp != null && `HP ${cs.hp}`, cs.atk != null && `ATK ${cs.atk}`, cs.def != null && `DEF ${cs.def}`, cs.spd != null && `SPD ${cs.spd}`,
        cs.critRate != null && `CRI Rate ${cs.critRate}%`, cs.critDmg != null && `CRI Dmg ${cs.critDmg}%`,
        cs.resistance != null && `Resistance ${cs.resistance}%`, cs.accuracy != null && `Accuracy ${cs.accuracy}%`,
      ].filter(Boolean);
      if (bits.length) lines.push(`   ${bits.join(" · ")}`);
    }

    if (i < main.length - 1) lines.push("");
  });

  if (team.turnOrder?.length) {
    lines.push("");
    lines.push(`⏱ Speed Tuning: ${team.turnOrder.join(" → ")}`);
  }
  if (team.focus?.length) {
    lines.push(`🔥 Focus priority: ${team.focus.join(" → ")}`);
  }
  return lines.join("\n");
}
