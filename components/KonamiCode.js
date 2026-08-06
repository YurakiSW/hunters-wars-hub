"use client";
import { useEffect, useState, useRef } from "react";
import DevilmonRain from "./DevilmonRain";

// Sequenza segreta, solo frecce (niente B/A come nell'originale, su
// richiesta di Flora). Nessun indizio da nessuna parte sul sito — chi la
// trova, la trova. La prima volta che un account la attiva viene
// registrata lato server (vedi /api/konami/found), poi in Admin.
const SEQUENCE = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight"];

// "PERFECT!" in stile Tekken (font Orbitron, il più vicino gratuito al
// logo originale — quello vero è proprietario) — piccola strizzata
// d'occhio in più, doppio riferimento Konami+Tekken sulla stessa scoperta.
function PerfectFlash() {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`
        @keyframes hwPerfectFlash {
          0% { opacity: 0; transform: scale(2.2); }
          15% { opacity: 1; transform: scale(1); }
          75% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(.92); }
        }
      `}</style>
      <span
        style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 900,
          fontSize: "clamp(40px, 9vw, 110px)",
          letterSpacing: ".06em",
          color: "#f7d774",
          WebkitTextStroke: "2px #3a2a0a",
          textShadow: "0 0 18px rgba(247,215,116,.9), 0 0 40px rgba(247,215,116,.5)",
          animation: "hwPerfectFlash 2.4s ease-in-out forwards",
        }}
      >
        PERFECT!
      </span>
    </div>
  );
}

export default function KonamiCode() {
  const [raining, setRaining] = useState(false);
  const [showPerfect, setShowPerfect] = useState(false);
  const bufferRef = useRef([]);

  useEffect(() => {
    function onKeyDown(e) {
      if (!SEQUENCE.includes(e.key)) return;
      bufferRef.current = [...bufferRef.current, e.key].slice(-SEQUENCE.length);
      if (bufferRef.current.join(",") === SEQUENCE.join(",")) {
        bufferRef.current = [];
        setRaining(true);
        setShowPerfect(true);
        setTimeout(() => setShowPerfect(false), 2400);
        fetch("/api/konami/found", { method: "POST" }).catch(() => {});
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      {raining && <DevilmonRain onDone={() => setRaining(false)} />}
      {showPerfect && <PerfectFlash />}
    </>
  );
}
