"use client";
import { useEffect, useState } from "react";
import MonsterCrest from "./MonsterCrest";

// Picker di ricerca per aggiungere una Difesa nemica già esistente alla
// lista "Da usare contro" di un deck. Nessun dettaglio di build: prende
// solo l'identità della Difesa (i suoi 3 mostri, leader il primo per
// convenzione) — lo stesso pattern di ricerca già usato in Counters/Difese
// Gilda, non un form nuovo.
export default function AgainstDefPicker({ onSelect, onCancel }) {
  const [defs, setDefs] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/defs")
      .then((r) => r.json())
      .then((d) => setDefs((d.defs || []).filter((x) => x.status === "approved")))
      .finally(() => setLoading(false));
  }, []);

  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = tokens.length
    ? defs.filter((d) => tokens.every((t) => d.monsters.some((m) => m.toLowerCase().includes(t))))
    : defs;

  return (
    <div>
      <input
        autoFocus
        placeholder="Cerca per mostro..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 10 }}
      />
      {loading ? (
        <p style={{ color: "var(--text-faint)", fontSize: 12.5 }}>Carico le difese...</p>
      ) : (
        <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map((d) => (
            <button
              key={d.id}
              className="btn btn-ghost"
              style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-start", padding: "8px 10px" }}
              onClick={() => onSelect(d.monsters)}
            >
              <div style={{ display: "flex", gap: 3 }}>
                {d.monsters.map((m, i) => (
                  <MonsterCrest key={i} name={m} size={26} square lead={i === 0} />
                ))}
              </div>
              <span style={{ fontSize: 13 }}>{d.monsters.join(" / ")}</span>
            </button>
          ))}
          {!filtered.length && <p style={{ color: "var(--text-faint)", fontSize: 12.5 }}>Nessuna difesa trovata.</p>}
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <button className="btn btn-ghost" onClick={onCancel}>Annulla</button>
      </div>
    </div>
  );
}
