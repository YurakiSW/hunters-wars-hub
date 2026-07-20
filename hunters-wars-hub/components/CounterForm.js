"use client";
import { useState } from "react";
import MonsterPicker from "./MonsterPicker";
import { RUNE_SETS, SLOT2_OPTIONS, SLOT4_OPTIONS, SLOT6_OPTIONS, ARTIFACT_LEFT_OPTIONS, ARTIFACT_RIGHT_OPTIONS } from "../lib/gameData";

function emptyUnit() {
  return { name: "", lead: false, runes: "", stats: "", artifactLeft: [], artifactRight: [], notes: [""] };
}

function StatSelect({ value, onChange }) {
  const parts = (value || "").split("/").map((p) => p.trim());
  const [s2, s4, s6] = [parts[0] || "", parts[1] || "", parts[2] || ""];
  const set = (i, v) => {
    const next = [s2, s4, s6];
    next[i] = v;
    onChange(next.filter(Boolean).length ? next.join(" / ") : "");
  };
  const rows = [
    ["Slot 2", s2, SLOT2_OPTIONS],
    ["Slot 4", s4, SLOT4_OPTIONS],
    ["Slot 6", s6, SLOT6_OPTIONS],
  ];
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {rows.map(([label, val, opts], i) => (
        <select key={label} value={val} onChange={(e) => set(i, e.target.value)}>
          <option value="">{label}</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ))}
    </div>
  );
}

function ArtifactPicker({ value, onChange, options }) {
  const toggle = (s) => {
    if (value.includes(s)) onChange(value.filter((v) => v !== s));
    else if (value.length < 6) onChange([...value, s]);
  };
  return (
    <div style={{ background: "var(--bg-soft)", border: "1px solid var(--border-soft)", borderRadius: 8, padding: 8, maxHeight: 160, overflowY: "auto" }}>
      {options.map((o) => {
        const idx = value.indexOf(o);
        return (
          <label key={o} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "3px 0", cursor: "pointer" }}>
            <input type="checkbox" checked={idx >= 0} disabled={idx < 0 && value.length >= 6} onChange={() => toggle(o)} />
            {idx >= 0 && <span className="f-mono" style={{ color: "var(--violet)", fontSize: 10 }}>{idx + 1}</span>}
            {o}
          </label>
        );
      })}
    </div>
  );
}

export default function CounterForm({ defMonsters, initial, onSubmit, onCancel }) {
  const [units, setUnits] = useState(initial?.units?.map((u) => ({ ...u })) || [emptyUnit(), emptyUnit(), emptyUnit()]);
  const [turnOrder, setTurnOrder] = useState(initial?.turnOrder || []);
  const [focus, setFocus] = useState(initial?.focus || []);
  const [strategy, setStrategy] = useState(initial?.strategy || "");
  const [warning, setWarning] = useState(initial?.warning || "");
  const [video, setVideo] = useState(initial?.video || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const unitNames = units.map((u) => u.name.trim()).filter(Boolean);

  function setUnit(i, patch) {
    setUnits((prev) => prev.map((u, idx) => (idx === i ? { ...u, ...patch } : u)));
  }
  function addVariant() {
    if (units.length < 4) setUnits((prev) => [...prev, emptyUnit()]);
  }

  async function submit() {
    setLoading(true);
    setError("");
    const payload = { units, turnOrder, focus, strategy, warning, video, images: initial?.images || [] };
    const res = await onSubmit(payload);
    setLoading(false);
    if (res?.error) setError(res.error);
  }

  return (
    <div>
      <p style={{ color: "var(--text-faint)", fontSize: 12.5, marginBottom: 16 }}>
        Tutti i campi sono obbligatori. Il counter {initial ? "torna" : "entra"} in coda "in attesa" per l'approvazione.
      </p>

      <div className="section-label">Squadra</div>
      {units.map((u, i) => (
        <div key={i} style={{ background: "var(--bg-soft)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span className="f-display" style={{ fontSize: 13.5 }}>Mostro {i + 1}</span>
            <label className="f-mono" style={{ fontSize: 11, display: "flex", gap: 4, alignItems: "center" }}>
              <input type="checkbox" checked={u.lead} onChange={(e) => setUnit(i, { lead: e.target.checked })} /> Lead
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <MonsterPicker value={u.name} onChange={(v) => setUnit(i, { name: v })} placeholder="Nome mostro" />
            <div>
              <div style={{ fontSize: 11, marginBottom: 4, color: "var(--text-muted)" }}>Rune</div>
              <select value={u.runes} onChange={(e) => setUnit(i, { runes: e.target.value })}>
                <option value="">Seleziona set...</option>
                {RUNE_SETS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, marginBottom: 4, color: "var(--text-muted)" }}>Priorità statistiche</div>
            <StatSelect value={u.stats} onChange={(v) => setUnit(i, { stats: v })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, marginBottom: 4, color: "var(--text-muted)" }}>Artefatto Attributo (sx)</div>
              <ArtifactPicker value={u.artifactLeft} onChange={(v) => setUnit(i, { artifactLeft: v })} options={ARTIFACT_LEFT_OPTIONS} />
            </div>
            <div>
              <div style={{ fontSize: 11, marginBottom: 4, color: "var(--text-muted)" }}>Artefatto Tipo (dx)</div>
              <ArtifactPicker value={u.artifactRight} onChange={(v) => setUnit(i, { artifactRight: v })} options={ARTIFACT_RIGHT_OPTIONS} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, marginBottom: 4, color: "var(--text-muted)" }}>Note</div>
            <textarea rows={2} value={u.notes[0] || ""} onChange={(e) => setUnit(i, { notes: [e.target.value] })} />
          </div>
        </div>
      ))}
      {units.length < 4 && (
        <button className="btn btn-ghost" onClick={addVariant} style={{ marginBottom: 16 }}>+ Aggiungi variante al terzo mostro</button>
      )}

      <div className="section-label" style={{ marginTop: 16 }}>Ordine turni</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {unitNames.map((_, i) => (
          <select
            key={i}
            value={turnOrder[i] || ""}
            onChange={(e) => setTurnOrder((prev) => { const n = [...prev]; n[i] = e.target.value; return n; })}
            style={{ width: 140 }}
          >
            <option value="">Turno {i + 1}</option>
            {unitNames.map((n) => <option key={n} value={n} disabled={turnOrder.includes(n) && turnOrder[i] !== n}>{n}</option>)}
          </select>
        ))}
      </div>

      <div className="section-label">Focus priority (bersagli sulla difesa)</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {defMonsters.map((_, i) => (
          <select
            key={i}
            value={focus[i] || ""}
            onChange={(e) => setFocus((prev) => { const n = [...prev]; n[i] = e.target.value; return n; })}
            style={{ width: 140 }}
          >
            <option value="">Priorità {i + 1}</option>
            {defMonsters.map((n) => <option key={n} value={n} disabled={focus.includes(n) && focus[i] !== n}>{n}</option>)}
          </select>
        ))}
      </div>

      <label style={{ display: "block", marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, marginBottom: 5, fontWeight: 600 }}>Strategia</div>
        <textarea rows={4} value={strategy} onChange={(e) => setStrategy(e.target.value)} />
      </label>
      <label style={{ display: "block", marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, marginBottom: 5, fontWeight: 600 }}>Avvertenze (facoltativo)</div>
        <input value={warning} onChange={(e) => setWarning(e.target.value)} />
      </label>
      <label style={{ display: "block", marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, marginBottom: 5, fontWeight: 600 }}>Link video (facoltativo)</div>
        <input value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://youtube.com/..." />
      </label>

      {error && <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" onClick={submit} disabled={loading}>{initial ? "Salva modifiche" : "Invia per approvazione"}</button>
        <button className="btn btn-ghost" onClick={onCancel}>Annulla</button>
      </div>
    </div>
  );
}
