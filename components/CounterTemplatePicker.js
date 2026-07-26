"use client";
import { useEffect, useState } from "react";
import MonsterCrest from "./MonsterCrest";

export default function CounterTemplatePicker({ onSelect, onClose }) {
  const [query, setQuery] = useState("");
  const [allDefs, setAllDefs] = useState([]);

  useEffect(() => {
    fetch("/api/defs").then((r) => r.json()).then((d) => setAllDefs(d.defs || []));
  }, []);

  // Ogni riga è un counter con il nome della sua Difesa accanto — così se
  // una Difesa ha più copie/varianti, si distinguono guardando la squadra.
  const rows = allDefs.flatMap((d) =>
    d.counters.map((c) => ({ defName: d.monsters.join(" / "), counter: c }))
  );

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) => r.counter.offense.some((m) => m.toLowerCase().includes(q)))
    : rows;

  return (
    <div>
      <p style={{ color: "var(--text-faint)", fontSize: 12.5, marginBottom: 12 }}>
        Cerca per mostro USATO NEL COUNTER (la squadra offensiva) e scegli quale usare come base. Focus priority e
        allegati non vengono copiati, il resto sì.
      </p>
      <input
        autoFocus
        placeholder="Cerca mostro nella squadra..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {filtered.slice(0, 40).map((r) => (
          <button
            key={r.counter.id}
            onClick={() => onSelect(r.counter)}
            className="card"
            style={{ display: "block", textAlign: "left", cursor: "pointer", padding: "10px 12px", color: "var(--text)", width: "100%" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              {r.counter.offense.map((m, i) => <MonsterCrest key={i} name={m} size={24} />)}
              <span style={{ fontSize: 13.5, marginLeft: 4, fontWeight: 600, color: "var(--text)" }}>{r.counter.offense.join(" · ")}</span>
            </div>
            <div className="f-mono" style={{ fontSize: 11, color: "var(--gold)" }}>▸ usato contro: {r.defName}</div>
          </button>
        ))}
        {filtered.length === 0 && <p style={{ color: "var(--text-faint)", fontSize: 13 }}>Nessun counter trovato.</p>}
      </div>
      <button className="btn btn-ghost" onClick={onClose} style={{ marginTop: 14 }}>Annulla</button>
    </div>
  );
}
