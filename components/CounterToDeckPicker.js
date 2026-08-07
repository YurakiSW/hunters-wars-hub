"use client";
import { useEffect, useState } from "react";
import MonsterCrest from "./MonsterCrest";

// Cerca tra TUTTI i counter del sito (di ogni Difesa), non uno alla volta
// aprendo ogni Difesa nemica — solo quelli approvati E arrivati da Siege
// Log (non i counter proposti a mano): sono quelli con dati reali di
// battaglia dietro, coerente con la stessa distinzione già usata altrove
// sul sito (counterAuthorLabel).
export default function CounterToDeckPicker({ onSelect, onCancel }) {
  const [counters, setCounters] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/defs")
      .then((r) => r.json())
      .then((d) => {
        const all = [];
        for (const def of d.defs || []) {
          for (const c of def.counters || []) {
            if (c.status === "approved" && /^Siege Log$/i.test(c.authorNickname || "")) {
              all.push({ ...c, defMonsters: def.monsters });
            }
          }
        }
        setCounters(all);
      })
      .finally(() => setLoading(false));
  }, []);

  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = tokens.length
    ? counters.filter((c) => tokens.every((t) => c.offense.some((m) => m.toLowerCase().includes(t))))
    : counters;

  return (
    <div>
      <input
        autoFocus
        placeholder="Cerca per mostro nel counter..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 10 }}
      />
      {loading ? (
        <p style={{ color: "var(--text-faint)", fontSize: 12.5 }}>Carico i counter...</p>
      ) : (
        <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map((c) => (
            <button
              key={c.id}
              className="btn btn-ghost"
              style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-start", padding: "8px 10px", textAlign: "left" }}
              onClick={() => onSelect(c.id)}
            >
              <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                {c.offense.map((m, i) => (
                  <MonsterCrest key={i} name={m} size={30} lead={c.units?.[i]?.lead} />
                ))}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13 }}>{c.offense.join(" / ")}</div>
                <div style={{ fontSize: 11, color: "var(--text-faint)" }}>contro {c.defMonsters.join(" / ")}</div>
              </div>
            </button>
          ))}
          {!filtered.length && <p style={{ color: "var(--text-faint)", fontSize: 12.5 }}>Nessun counter trovato.</p>}
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <button className="btn btn-ghost" onClick={onCancel}>Annulla</button>
      </div>
    </div>
  );
}
