"use client";
import { useState, useRef } from "react";
import { STICKERS } from "./Sticker";

// Easter egg silenzioso: hover (desktop) o click (mobile) su un nickname
// fa comparire per un attimo lo sticker coi cuoricini — nessun annuncio,
// nessuna spiegazione da nessuna parte, chi lo trova lo trova per caso.
export default function NicknameHeart({ children }) {
  const [show, setShow] = useState(false);
  const timerRef = useRef(null);

  function pulse() {
    setShow(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShow(false), 1100);
  }

  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4 }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={pulse}
    >
      {children}
      {show && (
        <img
          src={STICKERS.cuoricini}
          alt=""
          width={20}
          height={20}
          draggable={false}
          loading="lazy"
          decoding="async"
          style={{ objectFit: "contain", flexShrink: 0 }}
        />
      )}
    </span>
  );
}
