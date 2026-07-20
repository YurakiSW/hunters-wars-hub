"use client";
import { useEffect, useState } from "react";

function normalize(s) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

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

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

export default function MonsterCrest({ name, size = 40, lead = false }) {
  const [icon, setIcon] = useState(undefined);

  useEffect(() => {
    let alive = true;
    getMonsterList().then((list) => {
      if (!alive) return;
      const target = normalize(name);
      const match = list.find((m) => normalize(m.name) === target);
      setIcon(match?.iconUrl || null);
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
        background: icon ? "var(--bg-soft)" : `hsl(${hue} 45% 22%)`,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        position: "relative",
      }}
    >
      {icon ? (
        <img src={icon} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span className="f-display" style={{ color: `hsl(${hue} 70% 82%)`, fontSize: size * 0.34, fontWeight: 700 }}>
          {(name || "?").slice(0, 2).toUpperCase()}
        </span>
      )}
      {lead && (
        <span
          className="f-mono"
          style={{ position: "absolute", bottom: -2, right: -2, background: "var(--gold)", color: "#1a1408", fontSize: 8, fontWeight: 700, borderRadius: 4, padding: "0 3px" }}
        >
          L
        </span>
      )}
    </div>
  );
}
