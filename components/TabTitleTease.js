"use client";
import { useEffect } from "react";

const AWAY_TITLE = "torna qui! 👀";

// Classico easter egg da titolo di scheda — cattura il titolo VERO al
// momento in cui la scheda diventa nascosta (non una volta sola al mount,
// altrimenti dopo una navigazione client-side ripristinerebbe il titolo
// della pagina sbagliata) e lo rimette esattamente com'era al ritorno.
export default function TabTitleTease() {
  useEffect(() => {
    let savedTitle = null;
    function onVisibility() {
      if (document.hidden) {
        savedTitle = document.title;
        document.title = AWAY_TITLE;
      } else if (savedTitle != null) {
        document.title = savedTitle;
        savedTitle = null;
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return null;
}
