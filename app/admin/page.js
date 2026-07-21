"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../../components/Header";
import ConfirmModal from "../../components/ConfirmModal";
import Modal from "../../components/Modal";
import DefForm from "../../components/DefForm";
import CounterForm from "../../components/CounterForm";
import MonsterCrest from "../../components/MonsterCrest";

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
          {isAdmin && <button className={`btn ${tab === "backup" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("backup")}>Backup</button>}
          {isAdmin && <button className={`btn ${tab === "diagnostica" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("diagnostica")}>Diagnostica</button>}
        </div>

        {tab === "roster" && canSeeRoster && <RosterTab />}
        {tab === "users" && isAdmin && <UsersTab />}
        {tab === "monsters" && <MonstersTab />}
        {tab === "content" && canManageContent && <ContentTab />}
        {tab === "import" && isAdmin && <ImportTab />}
        {tab === "backup" && isAdmin && <BackupTab />}
        {tab === "diagnostica" && isAdmin && <DiagnosticaTab />}
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
      let entries;
      try {
        const data = JSON.parse(reader.result);
        const members = data?.guild?.guild_members;
        if (!members) throw new Error("Non trovo guild.guild_members in questo file.");
        entries = Object.values(members).map((m) => ({ nickname: m.wizard_name, grade: m.grade }));
      } catch (e) {
        setLoading(false);
        setError("File non valido: " + (e.message || e));
        return;
      }
      // Manda solo la lista estratta (nickname+grado), non il file intero:
      // molto più leggero e veloce di spedire 6+ MB di dati di gioco.
      const res = await fetch("/api/admin/roster", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries }),
      });
      const data = await res.json();
      setLoading(false);
      if (!res.ok) return setError(data.error);
      setMsg(`Roster aggiornato: ${data.count} membri.${data.removed ? ` ${data.removed} account rimossi (usciti dalla gilda).` : ""}`);
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

  useEffect(() => { fetch("/api/admin/monsters?manualOnly=1").then((r) => r.json()).then((d) => setManual(d.manual || [])); }, []);

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

      <AliasUploadCard />
    </div>
  );
}

function AliasUploadCard() {
  const [status, setStatus] = useState("idle");
  const [msg, setMsg] = useState("");
  const [aliases, setAliasesState] = useState({});

  useEffect(() => { fetch("/api/admin/aliases").then((r) => r.json()).then((d) => setAliasesState(d.aliases || {})); }, []);

  function handleFile(file) {
    setStatus("loading"); setMsg("");
    const reader = new FileReader();
    reader.onload = async () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch {
        setStatus("error"); setMsg("Il file non è un JSON valido.");
        return;
      }
      const res = await fetch("/api/admin/aliases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed) });
      const data = await res.json();
      setStatus(res.ok ? "done" : "error");
      setMsg(res.ok ? `Aggiunti ${data.count} alias (totale: ${data.total}).` : data.error);
      if (res.ok) fetch("/api/admin/aliases").then((r) => r.json()).then((d) => setAliasesState(d.aliases || {}));
    };
    reader.readAsText(file);
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="section-label">Alias nomignoli → nome ufficiale (in blocco)</div>
      <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 10 }}>
        Carica un file .json tipo <code>{`{"Nomignolo": "Nome Ufficiale"}`}</code> per collegare in blocco i nomignoli di gilda ai
        mostri veri — prendono così l'icona corretta ovunque vengano usati.
      </p>
      <label style={{ display: "block", border: "1.5px dashed var(--border)", borderRadius: 8, padding: "14px 12px", textAlign: "center", cursor: "pointer", color: "var(--text-muted)", fontSize: 12.5, background: "var(--bg-soft)" }}>
        {status === "loading" ? "Caricamento..." : "📎 Clicca per selezionare il file .json"}
        <input type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </label>
      {msg && <p style={{ color: status === "error" ? "var(--red)" : "var(--green)", fontSize: 12.5, marginTop: 8 }}>{msg}</p>}
      {Object.keys(aliases).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="f-mono" style={{ fontSize: 10.5, color: "var(--text-faint)", marginBottom: 4 }}>ALIAS ATTUALI ({Object.keys(aliases).length})</div>
          {Object.entries(aliases).map(([k, v]) => (
            <div key={k} style={{ fontSize: 12, padding: "3px 0" }}>{k} → {v}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function BackupTab() {
  const [status, setStatus] = useState("idle");
  const [msg, setMsg] = useState("");
  const [confirmFile, setConfirmFile] = useState(null); // file in attesa di conferma prima del ripristino

  function download() {
    window.location.href = "/api/admin/backup";
  }

  function handleFile(file) {
    setConfirmFile(file);
  }

  async function doRestore() {
    const file = confirmFile;
    setConfirmFile(null);
    setStatus("loading");
    setMsg("");
    const reader = new FileReader();
    reader.onload = async () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch {
        setStatus("error");
        setMsg("Il file non è un JSON valido.");
        return;
      }
      const res = await fetch("/api/admin/backup", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed),
      });
      const data = await res.json();
      setStatus(res.ok ? "done" : "error");
      setMsg(res.ok
        ? `Ripristinato: ${data.restoredDefs} Difese, ${data.restoredCounters} Counter, ${data.restoredUsers} utenti.`
        : data.error);
    };
    reader.readAsText(file);
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="section-label">Scarica backup</div>
        <p style={{ color: "var(--text-faint)", fontSize: 12.5, marginBottom: 12 }}>
          Scarica un file .json con tutto il sito così com'è ora: Difese, Counter, roster, utenti e mostri/alias aggiunti a mano.
          Tienilo da parte — se qualcosa va storto, lo ricarichi qui sotto e torna tutto come prima.
        </p>
        <button className="btn btn-gold" onClick={download}>⬇ Scarica backup</button>
      </div>

      <div className="card">
        <div className="section-label">Ripristina da backup</div>
        <p style={{ color: "var(--text-faint)", fontSize: 12.5, marginBottom: 12 }}>
          ⚠️ Sovrascrive completamente Difese, Counter, roster e utenti con quello che c'è nel file. Usalo solo per
          tornare a uno stato precedente conosciuto.
        </p>
        <label
          style={{
            display: "block", border: "1.5px dashed var(--border)", borderRadius: 8, padding: "14px 12px",
            textAlign: "center", cursor: "pointer", color: "var(--text-muted)", fontSize: 12.5, background: "var(--bg-soft)",
          }}
        >
          {status === "loading" ? "Ripristino in corso..." : "📎 Clicca per selezionare il file di backup"}
          <input type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </label>
        {status === "error" && <p style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{msg}</p>}
        {status === "done" && <p style={{ color: "var(--green)", fontSize: 13, marginTop: 8 }}>{msg}</p>}
      </div>

      {confirmFile && (
        <ConfirmModal
          message={`Ripristinare il sito dal file "${confirmFile.name}"? Tutte le Difese, Counter, roster e utenti attuali verranno sostituiti. Non si può annullare.`}
          confirmLabel="Ripristina"
          onConfirm={doRestore}
          onCancel={() => setConfirmFile(null)}
        />
      )}
    </div>
  );
}

function DiagnosticaTab() {
  const [checks, setChecks] = useState(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/admin/healthcheck").then((r) => r.json()).then((d) => {
      setChecks(d.checks || null);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div className="section-label">Controllo configurazione</div>
        <button className="btn btn-ghost" onClick={load} disabled={loading}>{loading ? "Controllo..." : "↻ Ricontrolla"}</button>
      </div>
      <p style={{ color: "var(--text-faint)", fontSize: 12.5, marginBottom: 14 }}>
        Verifica veloce se le variabili d'ambiente e i collegamenti (Upstash, roster, mostri sincronizzati) sono a
        posto — utile per capire subito dove cercare se qualcosa non funziona.
      </p>
      {checks?.map((c, i) => (
        <div key={i} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 13.5 }}>{c.ok ? "✅" : "❌"} {c.name}</span>
          <span className="f-mono" style={{ fontSize: 11.5, color: c.ok ? "var(--green)" : "var(--red)" }}>{c.detail}</span>
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
        const raw = await res.text();
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error(
            res.status === 504
              ? "Il server ha impiegato troppo tempo (troppi dati insieme). Riprova, o dividi il file in più parti più piccole."
              : `Il server ha risposto in modo inatteso (status ${res.status}). Riprova tra poco.`
          );
        }
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
  const [subTab, setSubTab] = useState("pending"); // pending | all

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className={`btn ${subTab === "pending" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSubTab("pending")}>In attesa di approvazione</button>
        <button className={`btn ${subTab === "all" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSubTab("all")}>Tutte / elimina in blocco</button>
      </div>
      {subTab === "pending" ? <PendingApprovalsSection /> : <AllContentSection />}
    </div>
  );
}

function PendingApprovalsSection() {
  const [defs, setDefs] = useState([]);
  const [editingDef, setEditingDef] = useState(null);
  const [editingCounter, setEditingCounter] = useState(null);
  const [confirmRejectDef, setConfirmRejectDef] = useState(null);
  const [confirmRejectCounter, setConfirmRejectCounter] = useState(null);

  function load() {
    fetch("/api/defs").then((r) => r.json()).then((d) => setDefs(d.defs || []));
  }
  useEffect(load, []);

  const pendingDefs = defs.filter((d) => d.status === "pending");
  const pendingCounters = defs.flatMap((d) =>
    d.counters.filter((c) => c.status === "pending").map((c) => ({ ...c, defId: d.id, defName: d.monsters.join(" / ") }))
  );

  async function approveDef(id) {
    await fetch(`/api/defs/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "approved" }) });
    load();
  }
  async function rejectDef(id) {
    await fetch(`/api/defs/${id}`, { method: "DELETE" });
    setConfirmRejectDef(null);
    load();
  }
  async function submitEditDef({ m1, m2, m3, desc }) {
    const res = await fetch(`/api/defs/${editingDef.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ m1, m2, m3, desc }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error };
    setEditingDef(null);
    load();
    return {};
  }

  async function approveCounter(id) {
    await fetch(`/api/counters/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "approved" }) });
    load();
  }
  async function rejectCounter(id) {
    await fetch(`/api/counters/${id}`, { method: "DELETE" });
    setConfirmRejectCounter(null);
    load();
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

  const total = pendingDefs.length + pendingCounters.length;

  return (
    <div>
      {total === 0 && <p style={{ color: "var(--text-faint)", fontSize: 13.5 }}>Niente in attesa — tutto approvato. 🎉</p>}

      {pendingDefs.length > 0 && (
        <>
          <div className="section-label">Difese in attesa ({pendingDefs.length})</div>
          {pendingDefs.map((d) => (
            <div key={d.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {d.monsters.map((m, i) => <MonsterCrest key={i} name={m} size={26} />)}
                <span style={{ fontSize: 13.5 }}>{d.monsters.join(" / ")}</span>
                <span className="f-mono" style={{ fontSize: 10.5, color: "var(--text-faint)" }}>proposta da {d.authorNickname}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => setEditingDef(d)}>✎ Modifica</button>
                <button className="btn btn-green" onClick={() => approveDef(d.id)}>✓ Approva</button>
                <button className="btn btn-danger" onClick={() => setConfirmRejectDef(d)}>✕ Rifiuta</button>
              </div>
            </div>
          ))}
        </>
      )}

      {pendingCounters.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: pendingDefs.length ? 20 : 0 }}>Counter in attesa ({pendingCounters.length})</div>
          {pendingCounters.map((c) => (
            <div key={c.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {c.offense.map((m, i) => <MonsterCrest key={i} name={m} size={26} />)}
                  <span style={{ fontSize: 13.5 }}>{c.offense.join(" · ")}</span>
                </div>
                <div className="f-mono" style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 4 }}>
                  su {c.defName} — proposto da {c.authorNickname}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => setEditingCounter(c)}>✎ Modifica</button>
                <button className="btn btn-green" onClick={() => approveCounter(c.id)}>✓ Approva</button>
                <button className="btn btn-danger" onClick={() => setConfirmRejectCounter(c)}>✕ Rifiuta</button>
              </div>
            </div>
          ))}
        </>
      )}

      {editingDef && (
        <Modal title={`Modifica difesa — ${editingDef.monsters.join(" / ")}`} onClose={() => setEditingDef(null)}>
          <DefForm initial={editingDef} onSubmit={submitEditDef} onCancel={() => setEditingDef(null)} />
        </Modal>
      )}
      {editingCounter && (
        <Modal title="Modifica counter" onClose={() => setEditingCounter(null)} wide>
          <CounterForm defMonsters={editingCounter.offense} initial={editingCounter} isEdit onSubmit={submitEditCounter} onCancel={() => setEditingCounter(null)} />
        </Modal>
      )}
      {confirmRejectDef && (
        <ConfirmModal
          message={`Rifiutare (eliminare) la difesa ${confirmRejectDef.monsters.join(" / ")} e i suoi counter? Non si può annullare.`}
          confirmLabel="Rifiuta"
          onConfirm={() => rejectDef(confirmRejectDef.id)}
          onCancel={() => setConfirmRejectDef(null)}
        />
      )}
      {confirmRejectCounter && (
        <ConfirmModal
          message={`Rifiutare (eliminare) il counter ${confirmRejectCounter.offense.join(" / ")}? Non si può annullare.`}
          confirmLabel="Rifiuta"
          onConfirm={() => rejectCounter(confirmRejectCounter.id)}
          onCancel={() => setConfirmRejectCounter(null)}
        />
      )}
    </div>
  );
}

function AllContentSection() {
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
  const allSelected = defs.length > 0 && defs.every((d) => selectedDefs.has(d.id));

  function toggleSelectAll() {
    setSelectedDefs(allSelected ? new Set() : new Set(defs.map((d) => d.id)));
    setSelectedCounters(new Set());
  }

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
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div className="section-label">Difese e Counter ({defs.length} difese)</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={toggleSelectAll} disabled={defs.length === 0}>
            {allSelected ? "Deseleziona tutto" : "Seleziona tutte le Difese"}
          </button>
          <button className="btn btn-danger" disabled={total === 0} onClick={() => setConfirmOpen(true)}>🗑 Elimina selezionati ({total})</button>
        </div>
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
