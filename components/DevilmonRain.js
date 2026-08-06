"use client";
import { useEffect, useState } from "react";
import { STICKERS } from "./Sticker";

// "totem" (riservato al caricamento) e "saltella" (riservato al contatore
// nickname) restano fuori dalla pioggia — hanno un significato loro
// altrove sul sito, non li mescolo qui.
const RAIN_NAMES = Object.keys(STICKERS).filter((n) => n !== "totem" && n !== "saltella");
const PIECE_COUNT = 28;
const MAX_END_MS = 8500; // copre il pezzo più lento (durata + ritardo massimi) con margine

// Un'unica animazione condivisa (variabili CSS per la differenza tra
// pezzi) invece di una @keyframes diversa per ognuno — molto più solido,
// niente rischio di nomi generati dinamicamente che si comportano in modo
// strano da un rendering all'altro.
export default function DevilmonRain({ onDone }) {
  const [pieces] = useState(() =>
    Array.from({ length: PIECE_COUNT }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: 32 + Math.random() * 78,
      duration: 3.8 + Math.random() * 2.8,
      delay: Math.random() * 1.8,
      rotation: Math.random() * 360,
      name: RAIN_NAMES[Math.floor(Math.random() * RAIN_NAMES.length)],
    }))
  );

  useEffect(() => {
    const t = setTimeout(onDone, MAX_END_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, pointerEvents: "none", overflow: "hidden" }}>
      <style>{`
        @keyframes hwDevilmonFall {
          0% { transform: translateY(-12vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(115vh) rotate(var(--hw-rot)); opacity: .85; }
        }
      `}</style>
      {pieces.map((p) => (
        <img
          key={p.id}
          src={STICKERS[p.name]}
          alt=""
          width={p.size}
          height={p.size}
          style={{
            position: "absolute",
            top: 0,
            left: p.left,
            objectFit: "contain",
            "--hw-rot": `${p.rotation}deg`,
            animation: `hwDevilmonFall ${p.duration}s linear ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}
