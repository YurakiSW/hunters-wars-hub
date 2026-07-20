"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../../../components/Header";
import Modal from "../../../components/Modal";
import ConfirmModal from "../../../components/ConfirmModal";
import CounterForm from "../../../components/CounterForm";

export default function DefDetailPage({ params }) {
  const [user, setUser] = useState(null);
  const [def, setDef] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingCounter, setEditingCounter] = useState(null);
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

  return (
    <div>
      <Header user={user} />
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 20px 60px" }}>
        <a href="/defs" style={{ color: "var(--text-muted)", fontSize: 13 }}>← Torna alle Difese</a>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 14 }}>
          <h1 className="f-display" style={{ fontSize: 26, margin: "0 0 4px" }}>{def.monsters.join(" / ")}</h1>
          {canManage && (
            <button className="btn btn-danger" onClick={() => setConfirmDeleteDef(true)}>🗑 Elimina difesa</button>
          )}
        </div>
        {def.desc && <p style={{ color: "var(--text-muted)" }}>{def.desc}</p>}

        <div style={{ display: "flex", justifyContent: "space-between", margin: "22px 0 14px" }}>
          <div className="section-label">Counter proposti ({def.counters.length})</div>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Proponi counter</button>
        </div>

        {def.counters.map((c) => (
          <div key={c.id} className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <div>
                <span className="f-display" style={{ fontSize: 16 }}>{c.offense.join(" · ")}</span>{" "}
                <span className={`badge ${c.status === "approved" ? "badge-approved" : "badge-pending"}`}>
                  {c.status === "approved" ? "Approvato" : "In attesa"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="f-mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>proposto da {c.authorNickname}</span>
                {(canManage || (c.authorId === user.id && c.status === "pending")) && (
                  <button className="btn btn-ghost" onClick={() => setEditingCounter(c)}>✎</button>
                )}
                {canManage && <button className="btn btn-ghost" onClick={() => setConfirmDeleteCounter(c)}>🗑</button>}
              </div>
            </div>
            <div className="f-mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Turni: {c.turnOrder.join(" → ")}
            </div>
            <div style={{ fontSize: 13, marginTop: 8 }}>{c.strategy}</div>
            {canManage && c.status === "pending" && (
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn btn-green" onClick={() => approveCounter(c.id, "approved")}>✓ Approva</button>
                <button className="btn btn-danger" onClick={() => approveCounter(c.id, "pending")}>✕ Rifiuta</button>
              </div>
            )}
          </div>
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
    </div>
  );
}
