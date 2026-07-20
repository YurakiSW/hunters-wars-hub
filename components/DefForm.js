"use client";
import { useState } from "react";
import MonsterPicker from "./MonsterPicker";

export default function DefForm({ initial, onSubmit, onCancel }) {
  const [m1, setM1] = useState(initial?.monsters?.[0] || "");
  const [m2, setM2] = useState(initial?.monsters?.[1] || "");
  const [m3, setM3] = useState(initial?.monsters?.[2] || "");
  const [desc, setDesc] = useState(initial?.desc || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError("");
    const res = await onSubmit({ m1, m2, m3, desc });
    setLoading(false);
    if (res?.error) setError(res.error);
  }

  return (
    <div>
      {initial && (
        <p style={{ color: "var(--text-faint)", fontSize: 12.5, marginBottom: 12 }}>
          Dopo la modifica la difesa torna in coda "in attesa" per una nuova approvazione.
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <MonsterPicker value={m1} onChange={setM1} placeholder="Mostro 1" />
        <MonsterPicker value={m2} onChange={setM2} placeholder="Mostro 2" />
        <MonsterPicker value={m3} onChange={setM3} placeholder="Mostro 3" />
      </div>
      <label style={{ display: "block", margin: "12px 0" }}>
        <div style={{ fontSize: 12.5, marginBottom: 5, fontWeight: 600 }}>Descrizione (facoltativa)</div>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
      </label>
      {error && <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 10 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" onClick={submit} disabled={loading}>{initial ? "Salva modifiche" : "Crea Difesa"}</button>
        <button className="btn btn-ghost" onClick={onCancel}>Annulla</button>
      </div>
    </div>
  );
}
