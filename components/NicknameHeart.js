"use client";
import { useState } from "react";
import { STICKERS } from "./Sticker";

// Easter egg silenzioso: hover SOLO sul proprio nickname (quello
// dell'utente loggato in quel momento) fa comparire per un attimo lo
// sticker coi cuoricini — nessun annuncio, nessuna spiegazione da nessuna
// parte. Ristretto il 05/08/2026 (Flora): prima compariva su QUALSIASI
// nickname, anche di altri giocatori — troppo. `isOwn` va calcolato dal
// chiamante (di solito confrontando authorId/ownerNick con l'utente
// loggato), qui non si indovina nulla.
export default function NicknameHeart({ isOwn, children }) {
  const [show, setShow] = useState(false);

  if (!isOwn) return <>{children}</>;

  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4 }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <img
          src={STICKERS.cuoricini}
          alt=""
          width={30}
          height={30}
          draggable={false}
          loading="lazy"
          decoding="async"
          style={{ objectFit: "contain", flexShrink: 0 }}
        />
      )}
    </span>
  );
}

