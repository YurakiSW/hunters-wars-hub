"use client";

import { useEffect, useState } from "react";

// Pulsante "torna in cima", in basso a destra. Compare solo dopo che si è
// scesi un po' (le liste di counter e proposal sono lunghe) e sparisce da
// solo in cima alla pagina, per non stare sempre lì in mezzo.
export default function ScrollToTop() {
  const [visibile, setVisibile] = useState(false);

  useEffect(() => {
    // Soglia: circa un'altezza di schermo. Sotto quella il pulsante non
    // servirebbe a niente e ruberebbe spazio, specie su telefono.
    const controlla = () => setVisibile(window.scrollY > window.innerHeight * 0.8);
    controlla();
    // passive: il browser sa che non blocchiamo lo scroll, così resta fluido
    window.addEventListener("scroll", controlla, { passive: true });
    return () => window.removeEventListener("scroll", controlla);
  }, []);

  function tornaSu() {
    // Rispetta chi ha chiesto meno animazioni nelle impostazioni di sistema:
    // per chi soffre di motion sickness lo scorrimento animato dà fastidio.
    const menoAnimazioni = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    window.scrollTo({ top: 0, behavior: menoAnimazioni ? "auto" : "smooth" });
  }

  return (
    <button
      type="button"
      onClick={tornaSu}
      aria-label="Torna in cima alla pagina"
      title="Torna in cima"
      style={{
        position: "fixed",
        right: 18,
        // sopra il footer, e sui telefoni sopra la barra di sistema
        bottom: "calc(18px + env(safe-area-inset-bottom, 0px))",
        width: 44,
        height: 44,
        borderRadius: "50%",
        border: "1px solid var(--border)",
        background: "var(--bg-soft)",
        color: "var(--gold)",
        fontSize: 18,
        lineHeight: 1,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
        // Sopra il contenuto ma SOTTO le finestre modali (che stanno a 1000+),
        // altrimenti resterebbe appiccicato sopra i dialoghi.
        zIndex: 40,
        opacity: visibile ? 1 : 0,
        transform: visibile ? "translateY(0)" : "translateY(8px)",
        // quando è invisibile non deve nemmeno intercettare i clic
        pointerEvents: visibile ? "auto" : "none",
        transition: "opacity .18s ease, transform .18s ease",
      }}
    >
      ↑
    </button>
  );
}
