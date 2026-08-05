"use client";
import { useState, useRef } from "react";

// Sticker ufficiali Devilmon di @summonerswarapp su Giphy (canale reale del
// gioco), sfondo trasparente. Presi da Flora il 05/08/2026, uno per
// emozione — usarli SOLO da questa mappa, mai linkare Giphy a caso altrove.
export const STICKERS = {
  depresso: "https://media.giphy.com/media/21q9O4a7PWXnXePThM/giphy.gif",
  sconvolto: "https://media.giphy.com/media/d4wXtHQKgc9ziT9Sxo/giphy.gif",
  totem: "https://media.giphy.com/media/sGM1Xg4U215NsQglro/giphy.gif",
  re: "https://media.giphy.com/media/gbRJtiRosEwsmTQJp2/giphy.gif",
  letto: "https://media.giphy.com/media/yqzJeF3sjcZuMZFPkN/giphy.gif",
  nonoScioccato: "https://media.giphy.com/media/C6ZG5WI2aHXyqrRUSS/giphy.gif",
  nonoPokerface: "https://media.giphy.com/media/ZgvgY58lIOaK3vzmiB/giphy.gif",
  emozionato: "https://media.giphy.com/media/MtRx9ojjrcrr3ew5ii/giphy.gif",
  felice: "https://media.giphy.com/media/UIA9uC1Jo64z2LeKDu/giphy.gif",
  sudaSconvolto: "https://media.giphy.com/media/yxD3KcxsK44xBuAZQu/giphy.gif",
  cuoricini: "https://media.giphy.com/media/edz2aT2IIsu6kZVvum/giphy.gif",
  confuso: "https://media.giphy.com/media/j3Lk3tROL9bbYNWX02/giphy.gif",
  trombetta: "https://media.giphy.com/media/XHt8Ti95Lb5Cp1Iiym/giphy.gif",
  saltella: "https://media.giphy.com/media/A1rzIPz4LqegUM0Fyj/giphy.gif",
};

// name: chiave in STICKERS da mostrare normalmente.
// revealOnClick: chiave alternativa da mostrare per `revealMs` ms dopo
//   `revealCount` click consecutivi (easter egg), poi torna a `name` da sola.
export default function Sticker({ name, size = 56, alt = "", style, revealOnClick, revealCount = 1, revealMs = 900, className }) {
  const [showAlt, setShowAlt] = useState(false);
  const clicksRef = useRef(0);
  const timerRef = useRef(null);

  function handleClick() {
    if (!revealOnClick) return;
    clicksRef.current += 1;
    if (clicksRef.current >= revealCount) {
      clicksRef.current = 0;
      setShowAlt(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setShowAlt(false), revealMs);
    }
  }

  const src = showAlt ? STICKERS[revealOnClick] : STICKERS[name];
  if (!src) return null;

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      loading="lazy"
      decoding="async"
      onClick={revealOnClick ? handleClick : undefined}
      className={className}
      style={{ objectFit: "contain", cursor: revealOnClick ? "pointer" : "default", userSelect: "none", ...style }}
    />
  );
}
