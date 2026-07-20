"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../../../components/Header";
import Modal from "../../../components/Modal";
import ConfirmModal from "../../../components/ConfirmModal";
import CounterForm from "../../../components/CounterForm";
import DefForm from "../../../components/DefForm";
import MonsterCrest from "../../../components/MonsterCrest";
import VideoPreview from "../../../components/VideoPreview";

export default function DefDetailPage({ params }) {
  const [user, setUser] = useState(null);
  const [def, setDef] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingCounter, setEditingCounter] = useState(null);
  const [editingDef, setEditingDef] = useState(false);
  const [confirmDeleteCounter, setConfirmDeleteCounter] = useState(null);
  const [confirmDeleteDef, setConfirmDeleteDef] = useState(false);
  const router = useRouter();

  async function load() {
    const res = await fetch(`/api/defs/${params.id}`);
    const data = await res.json();
    setDef(data.def);
  }

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (!d.user) return router.push("/login");
      if (d.user.status !== "approved") return router.push("/pending");
      setUser(d.user);
    });
    load();
  }, []);

  if (!user || !def) return null;
  const canManage = user.role === "admin" || user.role === "reviewer";

  async function submitNewCounter(payload) {
    const res = await fetch(`/api/defs/${def.id}/counters`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error };
    setShowForm(false);
    load();
    return {};
  }

  async function submitEditCounter(payload) {
    const res = await fetch(`/api/counters/${editingCounter.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error };
    setEditingCounter(null);
    load();
    return {};
  }

  async function approveCounter(id, status) {
    await fetch(`/api/counters/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    load();
  }

  async function deleteCounter(id) {
    await fetch(`/api/counters/${id}`, { method: "DELETE" });
    setConfirmDeleteCounter(null);
    load();
  }

  async function deleteDef() {
    await fetch(`/api/defs/${def.id}`, { method: "DELETE" });
    router.push("/defs");
  }

  async function submitEditDef({ m1, m2, m3, desc }) {
    const res = await fetch(`/api/defs/${def.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ m1, m2, m3, desc }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error };
    setEditingDef(false);
    load();
    return {};
  }

  return (
    <div>
      <Header user={user} />
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 20px 60px" }}>
        <a href="/defs" style={{ color: "var(--text-muted)", fontSize: 13 }}>← Torna alle Difese</a>

        <div style={{ display: "flex", marginTop: 14, marginBottom: 4 }}>
          {def.monsters.map((m, i) => (
            <div key={i} style={{ marginLeft: i === 0 ? 0 : -12, zIndex: 10 - i }}>
              <MonsterCrest name={m} size={54} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h1 className="f-display" style={{ fontSize: 26, margin: "0 0 4px" }}>{def.monsters.join(" / ")}</h1>
          {canManage && (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setEditingDef(true)}>✎ Modifica difesa</button>
              <button className="btn btn-danger" onClick={() => setConfirmDeleteDef(true)}>🗑 Elimina difesa</button>
            </div>
          )}
        </div>
        {def.desc && <p style={{ color: "var(--text-muted)" }}>{def.desc}</p>}

        <div style={{ display: "flex", justifyContent: "space-between", margin: "22px 0 14px" }}>
          <div className="section-label">Counter proposti ({def.counters.length})</div>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Proponi counter</button>
        </div>

        {def.counters.map((c) => (
          <CounterCard
            key={c.id}
            counter={c}
            user={user}
            canManage={canManage}
            onEdit={() => setEditingCounter(c)}
            onDelete={() => setConfirmDeleteCounter(c)}
            onApprove={() => approveCounter(c.id, "approved")}
            onReject={() => approveCounter(c.id, "pending")}
          />
        ))}
        {def.counters.length === 0 && <p style={{ color: "var(--text-faint)" }}>Nessun counter ancora per questa difesa.</p>}
      </div>

      {showForm && (
        <Modal title={`Nuovo counter — ${def.monsters.join(" / ")}`} onClose={() => setShowForm(false)} wide>
          <CounterForm defMonsters={def.monsters} onSubmit={submitNewCounter} onCancel={() => setShowForm(false)} />
        </Modal>
      )}
      {editingCounter && (
        <Modal title={`Modifica counter`} onClose={() => setEditingCounter(null)} wide>
          <CounterForm defMonsters={def.monsters} initial={editingCounter} onSubmit={submitEditCounter} onCancel={() => setEditingCounter(null)} />
        </Modal>
      )}
      {confirmDeleteCounter && (
        <ConfirmModal
          message={`Eliminare il counter ${confirmDeleteCounter.offense.join(" / ")}? Non si può annullare.`}
          onConfirm={() => deleteCounter(confirmDeleteCounter.id)}
          onCancel={() => setConfirmDeleteCounter(null)}
        />
      )}
      {confirmDeleteDef && (
        <ConfirmModal
          message={`Eliminare la difesa ${def.monsters.join(" / ")} e tutti i suoi ${def.counters.length} counter? Non si può annullare.`}
          onConfirm={deleteDef}
          onCancel={() => setConfirmDeleteDef(false)}
        />
      )}
      {editingDef && (
        <Modal title={`Modifica difesa — ${def.monsters.join(" / ")}`} onClose={() => setEditingDef(false)}>
          <DefForm initial={def} onSubmit={submitEditDef} onCancel={() => setEditingDef(false)} />
        </Modal>
      )}
    </div>
  );
}

function CounterCard({ counter: c, user, canManage, onEdit, onDelete, onApprove, onReject }) {
  const [open, setOpen] = useState(false);
  const canEdit = canManage || (c.authorId === user.id && c.status === "pending");

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div>
          <span className="f-display" style={{ fontSize: 16 }}>{c.offense.join(" · ")}</span>{" "}
          <span className={`badge ${c.status === "approved" ? "badge-approved" : "badge-pending"}`}>
            {c.status === "approved" ? "Approvato" : "In attesa"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="f-mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>proposto da {c.authorNickname}</span>
          {canEdit && <button className="btn btn-ghost" onClick={onEdit}>✎</button>}
          {canManage && <button className="btn btn-ghost" onClick={onDelete}>🗑</button>}
        </div>
      </div>

      <button className="btn btn-ghost" onClick={() => setOpen((o) => !o)}>
        {open ? "Nascondi dettagli ▲" : "Mostra dettagli completi ▼"}
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          <div className="section-label">Squadra</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 14 }}>
            {[...c.units].sort((a, b) => (b.lead ? 1 : 0) - (a.lead ? 1 : 0)).map((u) => (
              <div key={u.name} style={{ background: "var(--bg-soft)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <MonsterCrest name={u.name} size={28} lead={u.lead} />
                  <span className="f-display" style={{ fontSize: 14 }}>{u.name}</span>
                </div>
                <div className="f-mono" style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 2 }}>
                  Rune: <span style={{ color: "var(--text)" }}>{u.runes || "—"}</span>
                </div>
                <div className="f-mono" style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8 }}>
                  Stat: <span style={{ color: "var(--text)" }}>{u.stats || "—"}</span>
                </div>
                {u.artifactLeft?.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <div className="f-mono" style={{ fontSize: 10, color: "var(--text-faint)", textTransform: "uppercase" }}>Art. Attributo</div>
                    <ol style={{ margin: "2px 0", paddingLeft: 16, fontSize: 11.5 }}>
                      {u.artifactLeft.map((a, i) => <li key={i}>{a}</li>)}
                    </ol>
                  </div>
                )}
                {u.artifactRight?.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <div className="f-mono" style={{ fontSize: 10, color: "var(--text-faint)", textTransform: "uppercase" }}>Art. Tipo</div>
                    <ol style={{ margin: "2px 0", paddingLeft: 16, fontSize: 11.5 }}>
                      {u.artifactRight.map((a, i) => <li key={i}>{a}</li>)}
                    </ol>
                  </div>
                )}
                {u.notes?.filter(Boolean).length > 0 && (
                  <div>
                    <div className="f-mono" style={{ fontSize: 10, color: "var(--text-faint)", textTransform: "uppercase" }}>Note</div>
                    <ul style={{ margin: "2px 0", paddingLeft: 16, fontSize: 11.5, color: "var(--text-muted)" }}>
                      {u.notes.filter(Boolean).map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="section-label">Speed Tuning</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 14, overflowX: "auto" }}>
            {c.turnOrder.map((name, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 52 }}>
                  <span className="f-mono" style={{ fontSize: 10, color: "var(--violet)", fontWeight: 700, marginBottom: 2 }}>Turno {i + 1}</span>
                  <MonsterCrest name={name} size={36} lead={name === c.lead} />
                  <span style={{ fontSize: 11, marginTop: 4 }}>{name}</span>
                </div>
                {i < c.turnOrder.length - 1 && <div style={{ width: 18, height: 0, borderTop: "2px dashed var(--border)", marginBottom: 22, alignSelf: "center" }} />}
              </div>
            ))}
          </div>

          {c.focus?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="section-label">Focus priority</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {c.focus.map((m, i) => (
                  <span key={m} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {i > 0 && <span style={{ color: "var(--text-faint)" }}>→</span>}
                    <span style={{ background: "var(--gold-soft)", color: "var(--gold)", padding: "4px 9px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                      <MonsterCrest name={m} size={16} /> {m}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {c.strategy && (
            <div style={{ marginBottom: 12 }}>
              <div className="section-label">Strategia</div>
              <p style={{ fontSize: 13, lineHeight: 1.5 }}>{c.strategy}</p>
            </div>
          )}

          {c.warning && (
            <div style={{ background: "var(--red-soft)", border: "1px solid var(--red)", borderRadius: 8, padding: "8px 12px", color: "var(--red)", fontSize: 12.5, marginBottom: 12 }}>
              ⚠ {c.warning}
            </div>
          )}

          {(c.video || c.images?.length > 0) && (
            <div>
              <div className="section-label">Allegati</div>
              {c.video && <VideoPreview url={c.video} />}
              {c.images?.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: c.video ? 8 : 0 }}>
                  {c.images.map((img, i) => (
                    <img key={i} src={img.dataUrl} alt={img.name} title={img.name} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border-soft)" }} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {canManage && c.status === "pending" && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn btn-green" onClick={onApprove}>✓ Approva</button>
          <button className="btn btn-danger" onClick={onReject}>✕ Rifiuta</button>
        </div>
      )}
    </div>
  );
}
