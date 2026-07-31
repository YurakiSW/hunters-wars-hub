"use client";
import { useEffect, useState } from "react";
import { normalizeMonsterName as normalize } from "../lib/textUtils";

// Cache condivisa in memoria: tutti i MonsterCrest della pagina fanno UNA
// sola richiesta, non una a testa. La lista arriva da /api/admin/monsters,
// che unisce i mostri sincronizzati da swarfarm.com (in automatico) e
// quelli aggiunti a mano dall'Admin.
let cache = null;
let pending = null;
function getMonsterList() {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = fetch("/api/admin/monsters")
      .then((r) => r.json())
      .then((d) => {
        cache = d.monsters || [];
        return cache;
      })
      .catch(() => []);
  }
  return pending;
}

// Stessa logica di cache per le coppie collab <-> normale: una sola
// richiesta per pagina, condivisa da tutte le icone.
let twinCache = null;
let twinPending = null;
function getTwinPairs() {
  if (twinCache) return Promise.resolve(twinCache);
  if (!twinPending) {
    twinPending = fetch("/api/admin/monsters/twins")
      .then((r) => r.json())
      .then((d) => {
        twinCache = d.pairs || [];
        return twinCache;
      })
      .catch(() => []);
  }
  return twinPending;
}

// Da chiamare dopo aver sincronizzato il bestiario: la lista mostri è in
// cache condivisa, senza svuotarla i mostri nuovi non comparirebbero fino
// a un reload completo della pagina.
export function invalidateMonsterCache() {
  cache = null;
  pending = null;
}

// Da chiamare dopo aver aggiunto/rimosso una coppia in admin: senza questo
// le icone continuerebbero a mostrare la versione vecchia fino al reload.
export function invalidateTwinCache() {
  twinCache = null;
  twinPending = null;
}

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

export default function MonsterCrest({ name, size = 40, lead = false }) {
  const [icon, setIcon] = useState(undefined);
  const [twinIcon, setTwinIcon] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([getMonsterList(), getTwinPairs()]).then(([list, pairs]) => {
      if (!alive) return;
      const target = normalize(name);
      const iconOf = (n) => list.find((m) => normalize(m.name) === normalize(n))?.iconUrl || null;
      setIcon(iconOf(name));
      // Se questo mostro fa parte di una coppia collab <-> normale, mostriamo
      // metà faccia per ciascuna versione: si capisce a colpo d'occhio che il
      // counter vale per entrambe, senza doverlo scrivere.
      const pair = pairs.find(
        (p) => normalize(p.canonical) === target || p.alts.some((a) => normalize(a) === target)
      );
      if (!pair) return setTwinIcon(null);
      const other = normalize(pair.canonical) === target ? pair.alts[0] : pair.canonical;
      setTwinIcon(iconOf(other));
    });
    return () => { alive = false; };
  }, [name]);

  const key = normalize(name);
  const hue = hashHue(key || "x");

  return (
    <div
      title={name}
      style={{
        width: size,
        height: size,
        borderRadius: "9999px",
        border: `2px solid ${lead ? "var(--gold)" : "var(--border)"}`,
        background: icon ? "var(--bg-soft)" : `hsl(${hue} 55% 16%)`,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        position: "relative",
      }}
    >
      {icon && twinIcon ? (
        // Mezza e mezza: sinistra la versione con cui è salvato il counter,
        // destra il gemello. clipPath taglia ciascuna immagine a metà senza
        // deformarla (objectFit: cover sul doppio della larghezza).
        <div style={{ position: "absolute", inset: 0, display: "flex" }} title={`${name} (versione collab e normale)`}>
          <img src={icon} alt={name} style={{ width: "50%", height: "100%", objectFit: "cover", objectPosition: "left center" }} />
          <img src={twinIcon} alt="" style={{ width: "50%", height: "100%", objectFit: "cover", objectPosition: "right center" }} />
          <span style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "rgba(0,0,0,.45)" }} />
        </div>
      ) : icon ? (
        <img src={icon} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span className="f-display" style={{ color: "#ffffff", textShadow: "0 1px 2px rgba(0,0,0,.7)", fontSize: size * 0.34, fontWeight: 800 }}>
          {(name || "?").slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
}
