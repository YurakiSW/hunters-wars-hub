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
