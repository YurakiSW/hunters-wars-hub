"use client";
import { useEffect, useState } from "react";
import Sticker from "./Sticker";
import Confetti from "./Confetti";

// Easter egg puramente ambientale, ora anche "cattura vera" — nessuna
// azione lo scatena, nessun annuncio da nessuna parte. Ad ogni caricamento
// pagina, su schermi abbastanza larghi da avere margine libero ai lati del
// contenuto centrale, c'è una piccola possibilità che uno sticker a caso
// compaia per qualche secondo in un angolo/bordo casuale, poi sparisca da
// solo. Cliccandolo: coriandoli veri nel punto del click + il contatore
// sull'account sale di uno (Header, evento custom per aggiornarlo subito
// senza reload). Ognuno ha anche un mini secondo sticker "di reazione" se
// ci clicchi prima che sparisca. Aggiunto il 06/08/2026 (Flora): prima la
// trombetta del traguardo era legata solo alla creazione deck, che i
// player normali non fanno mai — così la vede/cattura chiunque, per puro
// caso, solo navigando.
export const DEVILMON_CAUGHT_EVENT = "hwhub:devilmon-caught";

const POOL = [
  { name: "trombetta", reveal: "sconvolto" },
  { name: "felice", reveal: "nonoPokerface" },
  { name: "sconvolto", reveal: "felice" },
  { name: "letto", reveal: "confuso" },
];

const SPOTS = [
  { top: "18%", left: "2%" },
  { top: "18%", right: "2%" },
  { top: "55%", left: "1.5%" },
  { top: "55%", right: "1.5%" },
  { bottom: "6%", left: "4%" },
  { bottom: "6%", right: "4%" },
];

const CHANCE = 1 / 6; // probabilità per ogni caricamento pagina, PRIMA del pity
const PITY_LIMIT = 5; // garantita entro questo tanti caricamenti dall'ultima comparsa
const MIN_WIDTH = 1150; // sotto questa larghezza non c'è margine laterale vero
const PITY_KEY = "hwhub_ambient_sticker_pity";

export default function AmbientSticker() {
  const [entry, setEntry] = useState(null); // { name, reveal, spot } | null
  const [caught, setCaught] = useState(false);
  const [confetti, setConfetti] = useState(null); // { x, y } | null

  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth < MIN_WIDTH) return;

    // "Pity" come nel gioco: a caso ogni volta, ma mai più di PITY_LIMIT
    // caricamenti di fila senza comparire almeno una volta. Contatore per
    // sessione del browser (sessionStorage), non per sempre — si azzera
    // ogni volta che compare, quindi ricomincia il conto.
    let count = 1;
    try {
      count = Number(sessionStorage.getItem(PITY_KEY) || "0") + 1;
    } catch {
      // sessionStorage non disponibile (privacy mode ecc.): niente pity,
      // resta solo la probabilità semplice.
    }
    const shouldShow = Math.random() < CHANCE || count >= PITY_LIMIT;
    if (!shouldShow) {
      try { sessionStorage.setItem(PITY_KEY, String(count)); } catch {}
      return;
    }
    try { sessionStorage.setItem(PITY_KEY, "0"); } catch {}

    const chosen = POOL[Math.floor(Math.random() * POOL.length)];
    const spot = SPOTS[Math.floor(Math.random() * SPOTS.length)];
    const delay = 2000 + Math.random() * 12000; // compare tra 2 e 14 secondi dopo il caricamento
    const showTimer = setTimeout(() => {
      setEntry({ ...chosen, spot });
      setCaught(false);
      const hideTimer = setTimeout(() => setEntry(null), 4500);
      return () => clearTimeout(hideTimer);
    }, delay);
    return () => clearTimeout(showTimer);
  }, []);

  async function handleCatch(e) {
    if (caught) return; // vale solo la prima volta per comparsa
    setCaught(true);
    setConfetti({ x: e.clientX, y: e.clientY });
    try {
      const res = await fetch("/api/devilmon/catch", { method: "POST" });
      const data = await res.json();
      if (res.ok) window.dispatchEvent(new CustomEvent(DEVILMON_CAUGHT_EVENT, { detail: { count: data.count } }));
    } catch {
      // easter egg, non deve mai rompere la navigazione se la richiesta fallisce
    }
  }

  return (
    <>
      {entry && (
        <div
          onClick={handleCatch}
          style={{
            position: "fixed",
            ...entry.spot,
            zIndex: 5,
            opacity: 0.92,
            cursor: "pointer",
            animation: "ambientStickerFade 4.5s ease-in-out",
          }}
        >
          <style>{`
            @keyframes ambientStickerFade {
              0% { opacity: 0; transform: scale(.7); }
              10% { opacity: .92; transform: scale(1); }
              85% { opacity: .92; transform: scale(1); }
              100% { opacity: 0; transform: scale(.85); }
            }
          `}</style>
          <Sticker name={entry.name} revealOnClick={entry.reveal} size={110} alt="" />
        </div>
      )}
      {confetti && <Confetti x={confetti.x} y={confetti.y} onDone={() => setConfetti(null)} />}
    </>
  );
}
