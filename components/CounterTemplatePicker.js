"use client";
import { useEffect, useState } from "react";
import MonsterCrest from "./MonsterCrest";

export default function CounterTemplatePicker({ onSelect, onClose }) {
  const [query, setQuery] = useState("");
  const [allDefs, setAllDefs] = useState([]);

  useEffect(() => {
    fetch("/api/defs").then((r) => r.json()).then((d) => setAllDefs(d.defs || []));
  }, []);

  const rows = allDefs.flatMap((d) =>
    d.counters.map((c) => ({ defName: d.monsters.join(" / "), counter: c }))
  );

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) => r.defName.toLowerCase().includes(q) || r.counter.offense.some((m) => m.toLowerCase().includes(q)))
    : rows;

  return (
    <div>
      <p style={{ color: "var(--text-faint)", fontSize: 12.5, marginBottom: 12 }}>
        Cerca per mostro (difesa o squadra) e scegli il counter da usare come base. Focus priority e allegati non
        vengono copiati, il resto sì.
      </p>
      <input
        autoFocus
        placeholder="Cerca per mostro..."
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
            style={{ display: "block", textAlign: "left", cursor: "pointer", padding: "10px 12px" }}
          >
            <div className="f-mono" style={{ fontSize: 10.5, color: "var(--text-faint)", marginBottom: 4 }}>{r.defName}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {r.counter.offense.map((m, i) => <MonsterCrest key={i} name={m} size={22} />)}
              <span style={{ fontSize: 13, marginLeft: 4 }}>{r.counter.offense.join(" · ")}</span>
            </div>
          </button>
        ))}
        {filtered.length === 0 && <p style={{ color: "var(--text-faint)", fontSize: 13 }}>Nessun counter trovato.</p>}
      </div>
      <button className="btn btn-ghost" onClick={onClose} style={{ marginTop: 14 }}>Annulla</button>
    </div>
  );
}
