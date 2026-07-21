// Utility di testo senza dipendenze — usabile sia lato server (lib/) che
// lato client (components/), a differenza di lib/monsters.js e lib/roster.js
// che importano Redis e quindi non possono girare nel browser.

// Toglie accenti e uniforma maiuscole/minuscole per confrontare nomi
// mostro: "Irène" = "irene". A differenza di normalizeNickname (roster.js),
// NON toglie spazi/simboli — "Water Nobara" deve restare distinguibile da
// "Wind Nobara", solo l'accento non deve contare.
export function normalizeMonsterName(s) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
