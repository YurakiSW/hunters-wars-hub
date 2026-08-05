"use client";
import { useEffect, useRef, useState } from "react";
import { STICKERS } from "./Sticker";
import { DEVILMON_CAUGHT_EVENT } from "./AmbientSticker";

const GAME_SECONDS = 12;
const HOLE_COUNT = 9; // griglia 3x3
const MOLE_UP_MS = 850;
const SPAWN_EVERY_MS = 650;
const MOLE_NAMES = ["trombetta", "felice", "sconvolto", "letto"];

// Minigioco vero, non solo decorazione — nascosto dietro un click ripetuto
// sul logo (nessun indizio scritto da nessuna parte). Ogni "colpo" preso
// entro il tempo diventa una cattura devilmon vera sull'account, in un
// solo colpo alla fine (bulk, vedi /api/devilmon/catch con "amount").
export default function WhackADevilmon({ onClose }) {
  const [secondsLeft, setSecondsLeft] = useState(GAME_SECONDS);
  const [score, setScore] = useState(0);
  const [active, setActive] = useState({}); // { [holeIndex]: moleName }
  const [ended, setEnded] = useState(false);
  const scoreRef = useRef(0);
  const activeRef = useRef({});

  useEffect(() => {
    const countdown = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(countdown);
          finish();
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    const spawner = setInterval(() => {
      const freeHoles = Array.from({ length: HOLE_COUNT }, (_, i) => i).filter((i) => activeRef.current[i] == null);
      if (!freeHoles.length) return;
      const hole = freeHoles[Math.floor(Math.random() * freeHoles.length)];
      const name = MOLE_NAMES[Math.floor(Math.random() * MOLE_NAMES.length)];
      activeRef.current = { ...activeRef.current, [hole]: name };
      setActive({ ...activeRef.current });
      setTimeout(() => {
        if (activeRef.current[hole] != null) {
          activeRef.current = { ...activeRef.current };
          delete activeRef.current[hole];
          setActive({ ...activeRef.current });
        }
      }, MOLE_UP_MS);
    }, SPAWN_EVERY_MS);

    return () => { clearInterval(countdown); clearInterval(spawner); };
  }, []);

  async function finish() {
    setEnded(true);
    const finalScore = scoreRef.current;
    if (finalScore > 0) {
      try {
        const res = await fetch("/api/devilmon/catch", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: finalScore }),
        });
        const data = await res.json();
        if (res.ok) window.dispatchEvent(new CustomEvent(DEVILMON_CAUGHT_EVENT, { detail: { count: data.count, streak: data.streak } }));
      } catch {
        // minigioco, non deve mai rompere altro se la chiamata fallisce
      }
    }
  }

  function whack(hole) {
    if (activeRef.current[hole] == null) return;
    activeRef.current = { ...activeRef.current };
    delete activeRef.current[hole];
    setActive({ ...activeRef.current });
    scoreRef.current += 1;
    setScore(scoreRef.current);
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 998, background: "rgba(5,3,12,.72)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={ended ? onClose : undefined}
    >
      <div
        className="card"
        style={{ width: 340, borderColor: "var(--gold)", textAlign: "center", cursor: "default" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="f-display" style={{ fontSize: 16, margin: "0 0 4px" }}>🕹️ Caccia lampo</p>
        {!ended ? (
          <p className="f-mono" style={{ fontSize: 12, color: "var(--text-faint)", margin: "0 0 12px" }}>
            {secondsLeft}s — presi: {score}
          </p>
        ) : (
          <p className="f-mono" style={{ fontSize: 12, color: "var(--gold)", margin: "0 0 12px" }}>
            Presi {score} devilmon! {score > 0 ? "Aggiunti al tuo conteggio." : ""}
          </p>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
          {Array.from({ length: HOLE_COUNT }, (_, i) => (
            <div
              key={i}
              onClick={() => whack(i)}
              style={{
                width: 80, height: 80, borderRadius: 10, background: "var(--bg-soft)",
                border: "1px solid var(--border-soft)", display: "flex", alignItems: "center", justifyContent: "center",
                cursor: active[i] ? "pointer" : "default", overflow: "hidden",
              }}
            >
              {active[i] && <img src={STICKERS[active[i]]} alt="" width={54} height={54} style={{ objectFit: "contain" }} draggable={false} />}
            </div>
          ))}
        </div>
        {ended && <button className="btn btn-gold" onClick={onClose}>Chiudi</button>}
      </div>
    </div>
  );
}
