"use client";
import { useEffect, useState } from "react";
import Sticker from "./Sticker";

// Easter egg puramente ambientale — nessuna azione lo scatena, nessun
// annuncio da nessuna parte. Ad ogni caricamento pagina, su schermi
// abbastanza larghi da avere margine libero ai lati del contenuto
// centrale, c'è una piccola possibilità che la trombetta compaia per
// qualche secondo in un angolo/bordo casuale, poi sparisce da sola.
// Aggiunto il 06/08/2026 (Flora): prima il traguardo era legato solo alla
// creazione deck, che i player normali non fanno mai — così lo vede
// chiunque, per puro caso, semplicemente navigando.
const SPOTS = [
  { top: "18%", left: "2%" },
  { top: "18%", right: "2%" },
  { top: "55%", left: "1.5%" },
  { top: "55%", right: "1.5%" },
  { bottom: "6%", left: "4%" },
  { bottom: "6%", right: "4%" },
];

const CHANCE = 1 / 6; // probabilità per ogni caricamento pagina
const MIN_WIDTH = 1150; // sotto questa larghezza non c'è margine laterale vero

export default function AmbientTrombetta() {
  const [spot, setSpot] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth < MIN_WIDTH) return;
    if (Math.random() > CHANCE) return;

    const chosenSpot = SPOTS[Math.floor(Math.random() * SPOTS.length)];
    const delay = 2000 + Math.random() * 12000; // compare tra 2 e 14 secondi dopo il caricamento
    const showTimer = setTimeout(() => {
      setSpot(chosenSpot);
      setTimeout(() => setSpot(null), 4000);
    }, delay);
    return () => clearTimeout(showTimer);
  }, []);

  if (!spot) return null;

  return (
    <div
      style={{
        position: "fixed",
        ...spot,
        zIndex: 5,
        pointerEvents: "none",
        opacity: 0.92,
        animation: "ambientTrombettaFade 4s ease-in-out",
      }}
    >
      <style>{`
        @keyframes ambientTrombettaFade {
          0% { opacity: 0; transform: scale(.7); }
          12% { opacity: .92; transform: scale(1); }
          82% { opacity: .92; transform: scale(1); }
          100% { opacity: 0; transform: scale(.85); }
        }
      `}</style>
      <Sticker name="trombetta" size={110} alt="" />
    </div>
  );
}
