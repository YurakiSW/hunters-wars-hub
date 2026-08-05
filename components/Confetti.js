"use client";
import { useEffect, useState } from "react";

const COLORS = ["#d3a94f", "#9376f2", "#4d7ec2", "#3fae82", "#d84852", "#ff6a35"];
const PIECE_COUNT = 26;

// Esplosione di coriandoli nel punto esatto del click — niente libreria
// esterna, solo pezzettini di CSS con direzione/rotazione/colore casuali,
// si tolgono da soli dopo l'animazione.
export default function Confetti({ x, y, onDone }) {
  const [pieces] = useState(() =>
    Array.from({ length: PIECE_COUNT }, (_, i) => ({
      id: i,
      angle: Math.random() * Math.PI * 2,
      distance: 40 + Math.random() * 90,
      rotation: Math.random() * 720 - 360,
      size: 5 + Math.random() * 5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: Math.random() * 80,
      duration: 700 + Math.random() * 500,
    }))
  );

  useEffect(() => {
    const t = setTimeout(onDone, 1300);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div style={{ position: "fixed", left: x, top: y, zIndex: 1000, pointerEvents: "none" }}>
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            borderRadius: 1,
            animation: `hwConfettiPiece${p.id} ${p.duration}ms ease-out ${p.delay}ms forwards`,
          }}
        />
      ))}
      <style>{pieces
        .map((p) => {
          const dx = Math.cos(p.angle) * p.distance;
          const dy = Math.sin(p.angle) * p.distance - 30;
          return `@keyframes hwConfettiPiece${p.id} {
            0% { transform: translate(0,0) rotate(0deg); opacity: 1; }
            100% { transform: translate(${dx}px, ${dy + 70}px) rotate(${p.rotation}deg); opacity: 0; }
          }`;
        })
        .join("\n")}</style>
    </div>
  );
}
