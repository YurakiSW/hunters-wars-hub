"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../../components/Header";
import ConfirmModal from "../../components/ConfirmModal";

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("content");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (!d.user) return router.push("/login");
      const allowed = ["admin", "reviewer"].includes(d.user.role) || d.user.canUploadRoster;
      if (!allowed) return router.push("/defs");
      setUser(d.user);
      setTab(d.user.role === "admin" ? "roster" : d.user.canUploadRoster ? "roster" : "content");
    });
  }, []);

  if (!user) return null;
  const isAdmin = user.role === "admin";
  // Chi ha il permesso "canUploadRoster" (di solito grado Vice in game) vede
  // il tab Roster anche senza essere Admin/Revisore — esattamente come
  // testato nella bozza: aggiorna il roster chiunque abbia il permesso.
  const canSeeRoster = isAdmin || user.canUploadRoster;
  const canManageContent = isAdmin || user.role === "reviewer";

  return (
    <div>
      <Header user={user} />
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 20px 60px" }}>
        <h1 className="f-display" style={{ fontSize: 24 }}>{isAdmin ? "Pannello Admin" : "Pannello Gestione"}</h1>
        <div style={{ display: "flex", gap: 8, margin: "18px 0", flexWrap: "wrap" }}>
          {canSeeRoster && (
            <button className={`btn ${tab === "roster" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("roster")}>Roster gilda</button>
          )}
          {isAdmin && (
            <button className={`btn ${tab === "users" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("users")}>Utenti & ruoli</button>
          )}
          <button className={`btn ${tab === "monsters" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("monsters")}>Mostri</button>
          {canManageContent && (
            <button className={`btn ${tab === "content" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("content")}>Gestione contenuti</button>
          )}
          {isAdmin && <button className={`btn ${tab === "import" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("import")}>Importa dati</button>}
        </div>

        {tab === "roster" && canSeeRoster && <RosterTab />}
        {tab === "users" && isAdmin && <UsersTab />}
        {tab === "monsters" && <MonstersTab />}
        {tab === "content" && canManageContent && <ContentTab />}
        {tab === "import" && isAdmin && <ImportTab />}
      </div>
    </div>
  );
}

function RosterTab() {
  const [roster, setRoster] = useState([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetch("/api/admin/roster").then((r) => r.json()).then((d) => setRoster(d.roster || [])); }, []);

  function handleFile(file) {
    setLoading(true);
    setError(""); setMsg("");
    const reader = new FileReader();
    reader.onload = async () => {
      const res = await fetch("/api/admin/roster", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rawJson: reader.result }),
      });
      const data = await res.json();
      setLoading(false);
      if (!res.ok) return setError(data.error);
      setMsg(`Roster aggiornato: ${data.count} membri.`);
      fetch("/api/admin/roster").then((r) => r.json()).then((d) => setRoster(d.roster || []));
    };
    reader.readAsText(file);
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="section-label">Carica JSON export (SWEX/SWProxy)</div>
        <label
          style={{
            display: "block", border: "1.5px dashed var(--border)", borderRadius: 8, padding: "18px 12px",
            textAlign: "center", cursor: "pointer", color: "var(--text-muted)", fontSize: 12.5, background: "var(--bg-soft)",
          }}
        >
          {loading ? "Caricamento..." : "📎 Clicca per selezionare il file .json"}
          <input type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </label>
        {error && <p style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{error}</p>}
        {msg && <p style={{ color: "var(--green)", fontSize: 13, marginTop: 8 }}>{msg}</p>}
        <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 8 }}>Vengono estratti solo nickname e grado — nessun altro dato dell'export viene salvato.</p>
      </div>
      <div className="section-label">Roster attuale ({roster.length})</div>
      {roster.map((r, i) => <div key={i} style={{ fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--border-soft)" }}>{r.nickname} — grado {r.grade}</div>)}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState([]);
  useEffect(() => { fetch("/api/admin/users").then((r) => r.json()).then((d) => setUsers(d.users || [])); }, []);

  async function updateUser(id, patch) {
    const res = await fetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const data = await res.json();
    if (res.ok) setUsers((prev) => prev.map((u) => (u.id === id ? data.user : u)));
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ background: "var(--bg-soft)" }}>
          <th style={{ textAlign: "left", padding: 8 }}>Nickname</th>
          <th style={{ textAlign: "left", padding: 8 }}>Grado</th>
          <th style={{ textAlign: "left", padding: 8 }}>Stato</th>
          <th style={{ textAlign: "left", padding: 8 }}>Ruolo</th>
          <th style={{ textAlign: "left", padding: 8 }}>Upload roster</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id} style={{ borderTop: "1px solid var(--border-soft)" }}>
            <td style={{ padding: 8 }}>{u.nickname}</td>
            <td style={{ padding: 8 }}>{u.grade ?? "—"}</td>
            <td style={{ padding: 8 }}><span className={`badge ${u.status === "approved" ? "badge-approved" : "badge-pending"}`}>{u.status}</span></td>
            <td style={{ padding: 8 }}>
              <select value={u.role} onChange={(e) => updateUser(u.id, { role: e.target.value })}>
                <option value="pending">In attesa</option>
                <option value="member">Membro</option>
                <option value="reviewer">Revisore Counters</option>
                <option value="admin">Admin</option>
              </select>
              {u.manualRole && <span className="f-mono" style={{ color: "var(--gold)", fontSize: 10, marginLeft: 6 }}>✎ manuale</span>}
            </td>
            <td style={{ padding: 8 }}>
              <input type="checkbox" checked={u.canUploadRoster} onChange={(e) => updateUser(u.id, { canUploadRoster: e.target.checked })} />
              {u.manualPerm && <span className="f-mono" style={{ color: "var(--gold)", fontSize: 10, marginLeft: 6 }}>✎ manuale</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MonstersTab() {
  const [manual, setManual] = useState([]);
  const [name, setName] = useState("");
  const [iconUrl, setIconUrl] = useState("");

  useEffect(() => { fetch("/api/admin/monsters").then((r) => r.json()).then((d) => setManual((d.monsters || []).filter((m) => !m.isAlias))); }, []);

  async function add() {
    const res = await fetch("/api/admin/monsters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, iconUrl }) });
    const data = await res.json();
    if (res.ok) { setManual(data.manual); setName(""); setIconUrl(""); }
  }
  async function remove(n) {
    const res = await fetch("/api/admin/monsters", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n }) });
    const data = await res.json();
    if (res.ok) setManual(data.manual);
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="section-label">Aggiungi mostro a mano</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <input placeholder="Nome mostro" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="URL icona (facoltativo)" value={iconUrl} onChange={(e) => setIconUrl(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={add} disabled={!name.trim()}>+ Aggiungi</button>
        <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 8 }}>
          Usalo per mostri appena usciti in game non ancora sincronizzati da swarfarm, o per alias di nomignoli di gilda.
        </p>
      </div>
      {manual.map((m) => (
        <div key={m.name} className="card" style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span>{m.name}</span>
          <button className="btn btn-danger" onClick={() => remove(m.name)}>Rimuovi</button>
        </div>
      ))}
    </div>
  );
}

function ImportTab() {
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  function handleFile(file) {
    setStatus("loading");
    setError("");
    setResult(null);
    const reader = new FileReader();
    reader.onload = async () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch {
        setStatus("error");
        setError("Il file non è un JSON valido.");
        return;
      }
      try {
        const res = await fetch("/api/admin/import-seed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Errore sconosciuto");
        setResult(data);
        setStatus("done");
      } catch (e) {
        setStatus("error");
        setError(String(e.message || e));
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="card">
      <div className="section-label">Importa Difese e Counter da file JSON</div>
      <p style={{ color: "var(--text-faint)", fontSize: 12.5, marginBottom: 12 }}>
        Carica un file .json (es. quello preparato durante la fase di bozza) per popolare in blocco Difese e Counter.
        Vengono importati già "approvati", con te come autore.
      </p>
      <label
        style={{
          display: "block", border: "1.5px dashed var(--border)", borderRadius: 8, padding: "18px 12px",
          textAlign: "center", cursor: "pointer", color: "var(--text-muted)", fontSize: 12.5, background: "var(--bg-soft)",
        }}
      >
        📎 Clicca per selezionare il file .json
        <input type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </label>

      {status === "loading" && <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 10 }}>Importazione in corso...</p>}
      {status === "error" && <p style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>{error}</p>}
      {status === "done" && result && (
        <div style={{ marginTop: 10 }}>
          <p style={{ color: "var(--green)", fontSize: 13 }}>
            Importate {result.importedDefs} Difese e {result.importedCounters} Counter.
          </p>
          {result.errors?.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ color: "var(--ember)", fontSize: 12, cursor: "pointer" }}>{result.errors.length} avvisi</summary>
              <ul style={{ fontSize: 11, color: "var(--text-faint)" }}>
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function ContentTab() {
  const [defs, setDefs] = useState([]);
  const [selectedDefs, setSelectedDefs] = useState(new Set());
  const [selectedCounters, setSelectedCounters] = useState(new Set());
  const [expanded, setExpanded] = useState(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => { fetch("/api/defs").then((r) => r.json()).then((d) => setDefs(d.defs || [])); }, []);

  function toggleSet(setter, key) {
    setter((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  const total = selectedDefs.size + selectedCounters.size;

  async function bulkDelete() {
    const counters = [...selectedCounters].map((key) => { const [defId, counterId] = key.split("::"); return { defId, counterId }; });
    await fetch("/api/admin/bulk-delete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defIds: [...selectedDefs], counters }),
    });
    setSelectedDefs(new Set()); setSelectedCounters(new Set()); setConfirmOpen(false);
    fetch("/api/defs").then((r) => r.json()).then((d) => setDefs(d.defs || []));
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
        <div className="section-label">Difese e Counter ({defs.length} difese)</div>
        <button className="btn btn-danger" disabled={total === 0} onClick={() => setConfirmOpen(true)}>🗑 Elimina selezionati ({total})</button>
      </div>
      {defs.map((d) => (
        <div key={d.id} style={{ borderBottom: "1px solid var(--border-soft)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--bg-soft)" }}>
            <input type="checkbox" checked={selectedDefs.has(d.id)} onChange={() => toggleSet(setSelectedDefs, d.id)} />
            <button onClick={() => toggleSet(setExpanded, d.id)} style={{ background: "none", border: "none", color: "var(--text-faint)" }}>
              {expanded.has(d.id) ? "▼" : "▶"}
            </button>
            <span style={{ flex: 1 }}>{d.monsters.join(" / ")}</span>
            <span className="f-mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>{d.counters.length} counter</span>
          </div>
          {expanded.has(d.id) && d.counters.map((c) => {
            const key = `${d.id}::${c.id}`;
            return (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px 7px 40px" }}>
                <input type="checkbox" checked={selectedCounters.has(key)} disabled={selectedDefs.has(d.id)} onChange={() => toggleSet(setSelectedCounters, key)} />
                <span style={{ flex: 1, fontSize: 12.5 }}>{c.offense.join(" · ")}</span>
                <span className={`badge ${c.status === "approved" ? "badge-approved" : "badge-pending"}`}>{c.status}</span>
              </div>
            );
          })}
        </div>
      ))}
      {confirmOpen && (
        <ConfirmModal
          message={`Eliminare ${selectedDefs.size} difese e ${selectedCounters.size} counter singoli? Non si può annullare.`}
          onConfirm={bulkDelete}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
