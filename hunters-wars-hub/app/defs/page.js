"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../../components/Header";
import MonsterPicker from "../../components/MonsterPicker";
import MonsterCrest from "../../components/MonsterCrest";
import Modal from "../../components/Modal";

export default function DefsPage() {
  const [user, setUser] = useState(null);
  const [defs, setDefs] = useState([]);
  const [query, setQuery] = useState("");
  const [showNewDef, setShowNewDef] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (!d.user) return router.push("/login");
      if (d.user.status !== "approved") return router.push("/pending");
      setUser(d.user);
    });
    fetch("/api/defs").then((r) => r.json()).then((d) => setDefs(d.defs || []));
  }, []);

  if (!user) return null;
  const canManage = user.role === "admin" || user.role === "reviewer";
  const filtered = query.trim()
    ? defs.filter((d) => d.monsters.some((m) => m.toLowerCase().includes(query.toLowerCase())))
    : defs;

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
            <a key={d.id} href={`/defs/${d.id}`} className="card" style={{ display: "block", textDecoration: "none" }}>
              <div style={{ display: "flex", marginBottom: 8 }}>
                {d.monsters.map((m, i) => (
                  <div key={i} style={{ marginLeft: i === 0 ? 0 : -10, zIndex: 10 - i }}>
                    <MonsterCrest name={m} size={40} />
                  </div>
                ))}
              </div>
              <div className="f-display" style={{ fontSize: 16, marginBottom: 6 }}>{d.monsters.join(" / ")}</div>
              {d.desc && <p style={{ color: "var(--text-muted)", fontSize: 12.5, margin: "0 0 10px" }}>{d.desc}</p>}
              <span className="badge badge-approved">{d.counters.filter((c) => c.status === "approved").length} counter</span>{" "}
              {d.counters.some((c) => c.status === "pending") && (
                <span className="badge badge-pending">{d.counters.filter((c) => c.status === "pending").length} in coda</span>
              )}
            </a>
          ))}
        </div>
        {filtered.length === 0 && <p style={{ color: "var(--text-faint)", marginTop: 20 }}>Nessuna difesa trovata.</p>}
      </div>

      {showNewDef && (
        <Modal title="Nuova difesa" onClose={() => setShowNewDef(false)}>
          <NewDefForm onDone={(def) => { setDefs((prev) => [def, ...prev]); setShowNewDef(false); }} onCancel={() => setShowNewDef(false)} />
        </Modal>
      )}
    </div>
  );
}

function NewDefForm({ onDone, onCancel }) {
  const [m1, setM1] = useState("");
  const [m2, setM2] = useState("");
  const [m3, setM3] = useState("");
  const [desc, setDesc] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/defs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ m1, m2, m3, desc }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return setError(data.error);
    onDone({ ...data.def, counters: [] });
  }

  return (
    <div>
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
        <button className="btn btn-primary" onClick={submit} disabled={loading}>Crea Difesa</button>
        <button className="btn btn-ghost" onClick={onCancel}>Annulla</button>
      </div>
    </div>
  );
}
