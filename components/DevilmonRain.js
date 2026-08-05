"use client";
import { useEffect, useState } from "react";
import { STICKERS } from "./Sticker";

const RAIN_NAMES = ["trombetta", "felice", "sconvolto", "letto", "cuoricini", "re", "confuso"];
const PIECE_COUNT = 28;
const MAX_END_MS = 5500; // copre il pezzo più lento (durata + ritardo massimi) con margine

export default function DevilmonRain({ onDone }) {
  const [pieces] = useState(() =>
    Array.from({ length: PIECE_COUNT }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: 40 + Math.random() * 40,
      duration: 2.2 + Math.random() * 1.8,
      delay: Math.random() * 1.2,
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
      {pieces.map((p) => (
        <img
          key={p.id}
          src={STICKERS[p.name]}
          alt=""
          width={p.size}
          height={p.size}
          style={{
            position: "absolute",
            top: -80,
            left: p.left,
            objectFit: "contain",
            animation: `hwDevilmonFall${p.id} ${p.duration}s linear ${p.delay}s forwards`,
          }}
        />
      ))}
      <style>{pieces
        .map(
          (p) => `@keyframes hwDevilmonFall${p.id} {
            0% { transform: translateY(0) rotate(0deg); opacity: 1; }
            100% { transform: translateY(110vh) rotate(${p.rotation}deg); opacity: .85; }
          }`
        )
        .join("\n")}</style>
    </div>
  );
}
