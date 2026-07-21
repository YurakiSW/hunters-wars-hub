"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../../components/Header";
import MonsterCrest from "../../components/MonsterCrest";
import Modal from "../../components/Modal";
import ConfirmModal from "../../components/ConfirmModal";
import DefForm from "../../components/DefForm";

export default function DefsPage() {
  const [user, setUser] = useState(null);
  const [defs, setDefs] = useState([]);
  const [query, setQuery] = useState("");
  const [showNewDef, setShowNewDef] = useState(false);
  const [editingDef, setEditingDef] = useState(null);
  const [confirmDeleteDef, setConfirmDeleteDef] = useState(null);
  const router = useRouter();

  function reload() {
    fetch("/api/defs").then((r) => r.json()).then((d) => setDefs(d.defs || []));
  }

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (!d.user) return router.push("/login");
      if (d.user.status !== "approved") return router.push("/pending");
      setUser(d.user);
    });
    reload();
  }, []);

  if (!user) return null;
  const canManage = user.role === "admin" || user.role === "reviewer";
  const sorted = [...defs].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return (a.monsters[0] || "").localeCompare(b.monsters[0] || "");
  });
  const filtered = query.trim()
    ? sorted.filter((d) => d.monsters.some((m) => m.toLowerCase().includes(query.toLowerCase())))
    : sorted;

  async function submitEditDef({ m1, m2, m3, desc }) {
    const res = await fetch(`/api/defs/${editingDef.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ m1, m2, m3, desc }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error };
    setEditingDef(null);
    reload();
    return {};
  }

  async function confirmDelete() {
    await fetch(`/api/defs/${confirmDeleteDef.id}`, { method: "DELETE" });
    setConfirmDeleteDef(null);
    reload();
  }

  async function togglePin(d) {
    const res = await fetch(`/api/defs/${d.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pinned: !d.pinned }),
    });
    const data = await res.json();
    if (data.def) setDefs((prev) => prev.map((x) => (x.id === d.id ? { ...x, pinned: data.def.pinned } : x)));
  }

  return (
    <div>
      <Header user={user} />
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 20px 60px" }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 22, flexWrap: "wrap" }}>
          <input placeholder="Cerca per mostro..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: 320 }} />
          <div style={{ flex: 1 }} />
          {canManage && <button className="btn btn-gold" onClick={() => setShowNewDef(true)}>+ Nuova difesa</button>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {filtered.map((d) => (
            <div key={d.id} className="card" style={{ position: "relative" }}>
              {canManage && (
                <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 6, zIndex: 2 }}>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: "3px 8px", color: d.pinned ? "var(--gold)" : undefined }}
                    title={d.pinned ? "Togli dalla cima" : "Fissa in cima"}
                    onClick={(e) => { e.preventDefault(); togglePin(d); }}
                  >
                    📌
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: "3px 8px" }}
                    onClick={(e) => { e.preventDefault(); setEditingDef(d); }}
                  >
                    ✎
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: "3px 8px" }}
                    onClick={(e) => { e.preventDefault(); setConfirmDeleteDef(d); }}
                  >
                    🗑
                  </button>
                </div>
              )}
              <a href={`/defs/${d.id}`} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                <div style={{ display: "flex", marginBottom: 8 }}>
                  {d.monsters.map((m, i) => (
                    <div key={i} style={{ marginLeft: i === 0 ? 0 : -10, zIndex: 10 - i }}>
                      <MonsterCrest name={m} size={40} />
                    </div>
                  ))}
                </div>
                <div className="f-display" style={{ fontSize: 16, marginBottom: 6 }}>
                  {d.pinned && <span title="Fissata in cima" style={{ color: "var(--gold)" }}>📌 </span>}
                  {d.monsters.join(" / ")}
                </div>
                {d.desc && <p style={{ color: "var(--text-muted)", fontSize: 12.5, margin: "0 0 10px" }}>{d.desc}</p>}
                <span className="badge badge-approved">{d.counters.filter((c) => c.status === "approved").length} counter</span>{" "}
                {d.counters.some((c) => c.status === "pending") && (
                  <span className="badge badge-pending">{d.counters.filter((c) => c.status === "pending").length} in coda</span>
                )}
              </a>
            </div>
          ))}
        </div>
        {filtered.length === 0 && <p style={{ color: "var(--text-faint)", marginTop: 20 }}>Nessuna difesa trovata.</p>}
      </div>

      {showNewDef && (
        <Modal title="Nuova difesa" onClose={() => setShowNewDef(false)}>
          <DefForm
            onCancel={() => setShowNewDef(false)}
            onSubmit={async ({ m1, m2, m3, desc }) => {
              const res = await fetch("/api/defs", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ m1, m2, m3, desc }),
              });
              const data = await res.json();
              if (!res.ok) return { error: data.error };
              setDefs((prev) => [{ ...data.def, counters: [] }, ...prev]);
              setShowNewDef(false);
              return {};
            }}
          />
        </Modal>
      )}
      {editingDef && (
        <Modal title={`Modifica difesa — ${editingDef.monsters.join(" / ")}`} onClose={() => setEditingDef(null)}>
          <DefForm initial={editingDef} onSubmit={submitEditDef} onCancel={() => setEditingDef(null)} />
        </Modal>
      )}
      {confirmDeleteDef && (
        <ConfirmModal
          message={`Eliminare la difesa ${confirmDeleteDef.monsters.join(" / ")} e tutti i suoi ${confirmDeleteDef.counters.length} counter? Non si può annullare.`}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDeleteDef(null)}
        />
      )}
    </div>
  );
}
