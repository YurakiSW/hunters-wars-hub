"use client";
import { useEffect, useState } from "react";

// Sopra il cielo stellato statico già nel body (app/globals.css) — questo
// aggiunge un secondo livello di stelle più piccole che tremolano piano,
// per dare un minimo di vita senza distrarre dalla lettura. Solo CSS,
// posizioni generate una volta sola (non ad ogni render), pointer-events
// disattivato così non interferisce mai con niente sotto.
const STAR_COUNT = 55;

function makeStars() {
  return Array.from({ length: STAR_COUNT }, () => ({
    top: `${Math.random() * 100}%`,
    left: `${Math.random() * 100}%`,
    size: 1 + Math.random() * 1.6,
    duration: 2.5 + Math.random() * 4,
    delay: Math.random() * 5,
    peakOpacity: 0.35 + Math.random() * 0.5,
  }));
}

export default function StarrySky() {
  // Vuoto sia sul server sia al primo render nel browser: nessuna stella,
  // nessun numero casuale, quindi server e browser producono ESATTAMENTE
  // lo stesso HTML — niente hydration mismatch. Le stelle vere arrivano
  // SOLO dopo, dentro useEffect, che gira esclusivamente nel browser.
  // PRIMA `useState(makeStars)` chiamava Math.random() anche durante il
  // disegno lato server, che produceva sempre posizioni diverse da quelle
  // del browser: era la causa esatta degli errori React #418/423/425 su
  // OGNI pagina del sito, perché questo componente è nel layout globale
  // (27/09/2026, Flora — segnalato come "un pulsante non risponde più al
  // click da nessuna parte", causato proprio da questo).
  const [stars, setStars] = useState([]);
  useEffect(() => {
    setStars(makeStars());
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", overflow: "hidden" }}>
      {stars.map((s, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            borderRadius: "9999px",
            background: "#fff",
            opacity: 0,
            animation: `hwStarTwinkle${i} ${s.duration}s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}
      <style>{stars
        .map(
          (s, i) => `@keyframes hwStarTwinkle${i} {
            0%, 100% { opacity: 0; }
            50% { opacity: ${s.peakOpacity}; }
          }`
        )
        .join("\n")}</style>
    </div>
  );
}
