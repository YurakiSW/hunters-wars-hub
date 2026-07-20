"use client";
import { useEffect, useState } from "react";

export default function MonsterPicker({ value, onChange, placeholder }) {
  const [allNames, setAllNames] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/admin/monsters")
      .then((r) => r.json())
      .then((d) => setAllNames((d.monsters || []).map((m) => m.name)))
      .catch(() => {});
  }, []);

  const matches = (value?.trim() ? allNames.filter((n) => n.toLowerCase().includes(value.toLowerCase())) : allNames).slice(0, 8);
  const isValid = allNames.some((n) => n.toLowerCase() === (value || "").trim().toLowerCase());

  return (
    <div style={{ position: "relative" }}>
      <input
        value={value}
        placeholder={placeholder || "Inizia a scrivere il nome..."}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
        name="monster-search-not-a-contact"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && matches.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20,
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8,
          maxHeight: 190, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,.4)",
        }}>
          {matches.map((m) => (
            <div key={m} onMouseDown={() => { onChange(m); setOpen(false); }}
              style={{ padding: "7px 10px", cursor: "pointer", fontSize: 13 }}>
              {m}
            </div>
          ))}
        </div>
      )}
      {value?.trim() && !isValid && (
        <p className="f-mono" style={{ color: "var(--red)", fontSize: 10.5, marginTop: 4 }}>
          ⚠ Non è un mostro dell'elenco — selezionane uno dalla lista.
        </p>
      )}
    </div>
  );
}
