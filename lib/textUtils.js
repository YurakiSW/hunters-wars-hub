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
  return /^Import Stats/i.test(name || "") ? "Admin" : name;
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
