"use client";
import { useEffect, useState, useRef } from "react";
import DevilmonRain from "./DevilmonRain";

// Sequenza segreta, solo frecce (niente B/A come nell'originale, su
// richiesta di Flora). Nessun indizio da nessuna parte sul sito — chi la
// trova, la trova. La prima volta che un account la attiva viene
// registrata lato server (vedi /api/konami/found), poi in Admin.
const SEQUENCE = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight"];

export default function KonamiCode() {
  const [raining, setRaining] = useState(false);
  const bufferRef = useRef([]);

  useEffect(() => {
    function onKeyDown(e) {
      if (!SEQUENCE.includes(e.key)) return;
      bufferRef.current = [...bufferRef.current, e.key].slice(-SEQUENCE.length);
      if (bufferRef.current.join(",") === SEQUENCE.join(",")) {
        bufferRef.current = [];
        setRaining(true);
        fetch("/api/konami/found", { method: "POST" }).catch(() => {});
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!raining) return null;
  return <DevilmonRain onDone={() => setRaining(false)} />;
}
