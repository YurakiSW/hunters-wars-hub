"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "../../components/Header";
import ConfirmModal from "../../components/ConfirmModal";
import Modal from "../../components/Modal";
import DefForm from "../../components/DefForm";
import CounterForm from "../../components/CounterForm";
import CounterTemplatePicker from "../../components/CounterTemplatePicker";
import MonsterCrest, { invalidateTwinCache, invalidateMonsterCache } from "../../components/MonsterCrest";
import MonsterPicker from "../../components/MonsterPicker";
import { gradeLabel, formatNickname, displayAuthorName, counterAuthorLabel, normalizeMonsterName } from "../../lib/textUtils";

// Evento interno alla pagina: lo lancia il pulsante "Sincronizza bestiario"
// (tab Diagnostica) e lo ascolta la tabella delle coppie collab (tab Mostri),
// che così si ripopola da sola con i mostri appena scaricati.
const MONSTERS_SYNCED_EVENT = "hwhub:monsters-synced";

// Separa "Water Gandalf" in { element: "Water", base: "Gandalf" }. L'ordine
// è quello usato in game (Fuoco, Acqua, Vento, Luce, Buio), così le varianti
// di uno stesso mostro si leggono nella sequenza a cui si è abituati.
const ELEMENT_ORDER = ["Fire", "Water", "Wind", "Light", "Dark"];
function splitElement(fullName) {
  const idx = ELEMENT_ORDER.findIndex((e) => (fullName || "").startsWith(`${e} `));
  if (idx === -1) return { element: null, base: fullName || "", order: 99 };
  return { element: ELEMENT_ORDER[idx], base: fullName.slice(ELEMENT_ORDER[idx].length + 1), order: idx };
}

function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

// useSearchParams() (usato più sotto, dentro PendingApprovalsSection) vuole
// un confine <Suspense> attorno, altrimenti la build fallisce in fase di
// generazione statica — per questo il contenuto vero è in un componente
// separato, avvolto qui sotto.
export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminPageContent />
    </Suspense>
  );
}

function AdminPageContent() {
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
            <button className={`btn ${tab === "content" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("content")}>Gestione def/counter</button>
          )}
          {isAdmin && <button className={`btn ${tab === "import" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("import")}>Importa dati</button>}
          {canManageContent && <button className={`btn ${tab === "siegeStats" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("siegeStats")}>Approvazioni Siege Log</button>}
          {isAdmin && <button className={`btn ${tab === "backup" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("backup")}>Backup</button>}
          {isAdmin && <button className={`btn ${tab === "diagnostica" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("diagnostica")}>Diagnostica</button>}
        </div>

        {tab === "roster" && canSeeRoster && <RosterTab isAdmin={isAdmin} />}
        {tab === "users" && isAdmin && <UsersTab />}
        {tab === "monsters" && <MonstersTab />}
        {tab === "content" && canManageContent && <ContentTab />}
        {tab === "import" && isAdmin && (
          <div>
            <ImportTab />
            <div style={{ marginTop: 18 }}><SiegeLogImportSection /></div>
          </div>
        )}
        {tab === "siegeStats" && canManageContent && <SiegeStatsProposalsTab isAdmin={isAdmin} />}
        {tab === "backup" && isAdmin && <BackupTab />}
        {tab === "diagnostica" && isAdmin && <DiagnosticaTab />}
      </div>
    </div>
  );
}

function RosterTab({ isAdmin }) {
  const [roster, setRoster] = useState([]);
  const [notFound, setNotFound] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [renameChoice, setRenameChoice] = useState({}); // id -> nickname scelto nel menu
  const [renaming, setRenaming] = useState(null);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  function reload() {
    fetch("/api/admin/roster").then((r) => r.json()).then((d) => {
      setRoster(d.roster || []);
      setNotFound(d.notFound || []);
      setUnassigned(d.unassigned || []);
      setSelected(new Set());
    });
  }
  useEffect(reload, []);

  async function rename(candidateId) {
    const newNickname = renameChoice[candidateId];
    if (!newNickname) return;
    setRenaming(candidateId);
    const res = await fetch("/api/admin/roster/rename-member", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: candidateId, newNickname }),
    });
    const data = await res.json();
    setRenaming(null);
    if (!res.ok) return setError(data.error);
    setMsg(`Account associato al nuovo nickname "${data.nickname}".`);
    reload();
  }

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
      setMsg(
        `Roster aggiornato: ${data.count} membri.` +
        (data.notFound?.length ? ` ${data.notFound.length} account non combaciano più — nessuno eliminato in automatico, controlla la lista sotto.` : "")
      );
      reload();
    };
    reader.readAsText(file);
  }

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function confirmRemove() {
    setConfirmRemoval(false);
    const res = await fetch("/api/admin/roster/remove-members", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userIds: Array.from(selected) }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setMsg(`${data.removed} account eliminati.`);
    reload();
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
          {loading ? <><Spinner />Caricamento...</> : "📎 Clicca per selezionare il file .json"}
          <input type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </label>
        {error && <p style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{error}</p>}
        {msg && <p style={{ color: "var(--green)", fontSize: 13, marginTop: 8 }}>{msg}</p>}
        <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 8 }}>Vengono estratti solo nickname e grado — nessun altro dato dell'export viene salvato.</p>
      </div>

      {notFound.length > 0 && (
        <div className="card" style={{ marginBottom: 18, borderColor: "var(--gold)" }}>
          <div className="section-label">⚠️ Account non trovati nell'ultimo roster ({notFound.length})</div>
          <p style={{ color: "var(--text-faint)", fontSize: 12.5, marginBottom: 10 }}>
            Questi nickname del sito non combaciano col roster appena caricato. Potrebbero aver lasciato la gilda,
            oppure aver solo cambiato nickname in gioco — se è così, associalo al nuovo nickname invece di eliminarlo
            (mantiene ruolo, permessi, ed è ancora l'autore di Difese/Counter già creati). Nessuno viene rimosso
            automaticamente.
          </p>
          {notFound.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, padding: "6px 0", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                {c.nickname} — {gradeLabel(c.grade)} {c.email ? `(${c.email})` : ""}
              </label>
              {isAdmin && unassigned.length > 0 && (
                <>
                  <select
                    value={renameChoice[c.id] || ""}
                    onChange={(e) => setRenameChoice((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    style={{ fontSize: 12.5 }}
                  >
                    <option value="">— associa a nuovo nickname —</option>
                    {unassigned.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <button className="btn btn-gold" disabled={!renameChoice[c.id] || renaming === c.id} onClick={() => rename(c.id)}>
                    {renaming === c.id && <Spinner />}Associa
                  </button>
                </>
              )}
            </div>
          ))}
          {isAdmin && (
            <button
              className="btn btn-danger"
              style={{ marginTop: 10 }}
              disabled={selected.size === 0}
              onClick={() => setConfirmRemoval(true)}
            >
              🗑 Elimina {selected.size || ""} selezionati
            </button>
          )}
        </div>
      )}

      <div className="section-label">Roster attuale ({roster.length})</div>
      {roster.map((r, i) => <div key={i} style={{ fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--border-soft)" }}>{r.nickname} — {gradeLabel(r.grade)}</div>)}

      {confirmRemoval && (
        <ConfirmModal
          message={`Eliminare ${selected.size} account selezionati? Le Difese/Counter che hanno creato restano intatte, ma l'accesso al sito viene revocato. Non si può annullare.`}
          confirmLabel="Elimina"
          onConfirm={confirmRemove}
          onCancel={() => setConfirmRemoval(false)}
        />
      )}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [emailMsg, setEmailMsg] = useState("");
  useEffect(() => { fetch("/api/admin/users").then((r) => r.json()).then((d) => setUsers(d.users || [])); }, []);

  async function updateUser(id, patch) {
    const res = await fetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const data = await res.json();
    if (res.ok) setUsers((prev) => prev.map((u) => (u.id === id ? data.user : u)));
    if (data.emailResult) {
      setEmailMsg(data.emailResult.ok ? "✅ Email di benvenuto inviata." : `❌ Email NON inviata: ${data.emailResult.error}`);
    }
  }

  async function deleteUser(id) {
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    const data = await res.json();
    setUsers((prev) => prev.filter((u) => u.id !== id));
    setConfirmDelete(null);
    if (data.emailResult) {
      setEmailMsg(data.emailResult.ok ? "✅ Email di rifiuto inviata." : `❌ Email NON inviata: ${data.emailResult.error}`);
    }
  }

  return (
    <div>
      {emailMsg && <p style={{ fontSize: 12.5, marginBottom: 10 }}>{emailMsg}</p>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--bg-soft)" }}>
            <th style={{ textAlign: "left", padding: 8 }}>Nickname</th>
            <th style={{ textAlign: "left", padding: 8 }}>Grado</th>
            <th style={{ textAlign: "left", padding: 8 }}>Stato</th>
            <th style={{ textAlign: "left", padding: 8 }}>Ruolo</th>
            <th style={{ textAlign: "left", padding: 8 }}>Upload roster</th>
            <th style={{ textAlign: "left", padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ borderTop: "1px solid var(--border-soft)" }}>
              <td style={{ padding: 8 }}>{formatNickname(u.nickname, u.role === "admin" || u.role === "reviewer")}</td>
              <td style={{ padding: 8 }}>{gradeLabel(u.grade)}</td>
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
              <td style={{ padding: 8 }}>
                {u.role !== "admin" && (
                  <button className="btn btn-danger" onClick={() => setConfirmDelete(u)}>
                    {u.status === "pending" ? "✕ Rifiuta" : "🗑 Rimuovi"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {confirmDelete && (
        <ConfirmModal
          message={
            confirmDelete.status === "pending"
              ? `Rifiutare la richiesta di "${confirmDelete.nickname}"? Riceverà una mail di rifiuto. Non si può annullare.`
              : `Rimuovere l'account di "${confirmDelete.nickname}"? Le sue Difese/Counter restano. Non si può annullare.`
          }
          confirmLabel={confirmDelete.status === "pending" ? "Rifiuta" : "Rimuovi"}
          onConfirm={() => deleteUser(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
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
      <TwinPairsCard />
    </div>
  );
}

// Coppie collab <-> versione normale: due mostri diversi in game (nome, id e
// aspetto) ma con kit e stat base identici. Registrandoli qui, il sito li
// tratta come UN solo mostro — così un counter giocato con la versione
// collab e uno con la versione normale finiscono nello stesso counter invece
// di duplicarsi, e le statistiche si sommano.
function TwinPairsCard() {
  const [pairs, setPairs] = useState([]);
  const [rows, setRows] = useState([]);       // [{ name, canonical }]
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [iconKey, setIconKey] = useState(0);
  const [manualAlt, setManualAlt] = useState("");
  const [manualCanonical, setManualCanonical] = useState("");
  const [onlyTodo, setOnlyTodo] = useState(false);

  // Inserimento manuale: stesso salvataggio del resto della tabella, solo su
  // una riga sola. Dopo il salvataggio la coppia rientra nell'elenco normale
  // (loadRows tiene anche le corrispondenze fuori dalla regola automatica).
  async function addManual() {
    const res = await fetch("/api/admin/monsters/twins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ altName: manualAlt, canonicalName: manualCanonical }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error);
    setManualAlt(""); setManualCanonical(""); setMsg("");
    invalidateTwinCache();
    setIconKey((k) => k + 1);
    loadRows();
  }

  // Costruisce la tabella: una riga per ogni mostro da collaborazione del
  // bestiario. Si ricarica da sola quando il bestiario viene risincronizzato,
  // così i mostri di un collab appena uscito compaiono subito senza reload.
  const loadRows = useCallback(() => {
    Promise.all([
      fetch("/api/admin/monsters").then((r) => r.json()),
      fetch("/api/admin/monsters/twins").then((r) => r.json()),
    ]).then(([mon, tw]) => {
      const all = mon.monsters || [];
      const twins = {};
      for (const p of tw.pairs || []) for (const a of p.alts) twins[normalizeMonsterName(a)] = p.canonical;
      // I collab li riconosce direttamente il sync del bestiario (stesso nome
      // su più elementi): nessun elenco scritto a mano, quindi ogni collab
      // futuro compare da solo. Si aggiungono anche le corrispondenze già
      // registrate che non rientrano nella regola (es. un collab uscito in
      // un solo elemento, come Frodo).
      const rowsFromFlag = all.filter((m) => m.isCollab).map((m) => m.name);
      const extra = Object.keys(twins)
        .map((k) => all.find((m) => normalizeMonsterName(m.name) === k)?.name)
        .filter((n) => n && !rowsFromFlag.includes(n));
      // Anche il gemello "normale" riusa lo stesso nome su tutti gli elementi,
      // quindi la regola automatica pesca ENTRAMBE le facce della coppia. Una
      // volta che una è stata abbinata, l'altra sparisce dall'elenco:
      // altrimenti ti ritroveresti a compilare due volte la stessa coppia,
      // una per verso.
      const alreadyTargets = new Set(
        Object.values(twins).map((v) => normalizeMonsterName(v))
      );
      const found = [...rowsFromFlag, ...extra]
        .filter((name) => {
          const n = normalizeMonsterName(name);
          return !alreadyTargets.has(n) || twins[n]; // resta se è a sua volta abbinato
        })
        .map((name) => ({ name, canonical: twins[normalizeMonsterName(name)] || "" }))
        .sort((a, b) => {
          // Ordina per NOME del mostro, non per elemento: altrimenti le
          // varianti della stessa famiglia finiscono sparse nell'elenco
          // ("Dark Ciri" tra le D, "Water Ciri" tra le W). Così invece
          // Ciri/Ciri/Ciri restano una sotto l'altra, nell'ordine elementale
          // classico del gioco.
          const pa = splitElement(a.name), pb = splitElement(b.name);
          return pa.base.localeCompare(pb.base) || pa.order - pb.order;
        });
      setRows(found);
      setPairs(tw.pairs || []);
    });
  }, []);

  useEffect(() => {
    loadRows();
    window.addEventListener(MONSTERS_SYNCED_EVENT, loadRows);
    return () => window.removeEventListener(MONSTERS_SYNCED_EVENT, loadRows);
  }, [loadRows]);

  function setRow(i, canonical) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, canonical } : r)));
  }

  async function saveAll() {
    const entries = rows.filter((r) => r.canonical.trim()).map((r) => ({ altName: r.name, canonicalName: r.canonical }));
    if (!entries.length) return setMsg("Nessuna corrispondenza da salvare.");
    setSaving(true);
    const res = await fetch("/api/admin/monsters/twins", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "bulk", entries }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return setMsg(data.error);
    setPairs(data.pairs || []);
    setMsg(`${data.saved} corrispondenze salvate (totale registrate: ${data.total}).`);
    invalidateTwinCache();
    setIconKey((k) => k + 1);
  }

  async function removeOne(altName) {
    const res = await fetch("/api/admin/monsters/twins", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", altName }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error);
    setPairs(data.pairs || []);
    setRows((prev) => prev.map((r) => (r.name === altName ? { ...r, canonical: "" } : r)));
    invalidateTwinCache();
    setIconKey((k) => k + 1);
  }

  const compiled = rows.filter((r) => r.canonical.trim()).length;

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="section-label">Versioni collab ↔ versione normale</div>
      <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "6px 0 10px" }}>
        I mostri da collaborazione hanno un &quot;gemello&quot; normale con kit identico. Indicando qui la
        corrispondenza, il sito li tratta come <strong>lo stesso mostro</strong>: i counter non si duplicano più e le
        statistiche si sommano. L&apos;elenco a sinistra è ricavato da solo dal bestiario (i collab sono gli unici a
        riusare lo stesso nome su più elementi), quindi <strong>si aggiorna da sé a ogni nuovo collab</strong>:
        compila la colonna di destra quando escono i corrispettivi, le righe vuote non fanno nulla.
      </p>

      {rows.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>
          Nessun mostro da collaborazione trovato nel bestiario — lancia prima &quot;Sincronizza bestiario&quot; in Diagnostica.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <button className="btn btn-gold" disabled={saving} onClick={saveAll}>
              {saving && <Spinner />}💾 Salva tutte le corrispondenze
            </button>
            <span className="f-mono" style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
              {compiled} compilate su {rows.length}
            </span>
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
              <input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} />
              Mostra solo da compilare
            </label>
          </div>
          {msg && <p style={{ fontSize: 12.5, color: "var(--green)", marginBottom: 8 }}>{msg}</p>}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.map((r, i) => ({ r, i })).filter(({ r }) => !onlyTodo || !r.canonical.trim()).map(({ r, i }) => {
              return (
                <div key={r.name}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 230 }}>
                      <MonsterCrest key={`${r.name}-${iconKey}`} name={r.name} size={32} noSplit />
                      <span style={{ fontSize: 13 }}>{r.name}</span>
                    </div>
                    <span style={{ color: "var(--text-faint)" }}>→</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 240 }}>
                      <MonsterCrest key={`c-${r.canonical}-${iconKey}`} name={r.canonical} size={32} noSplit />
                      <div style={{ flex: 1 }}>
                        <MonsterPicker value={r.canonical} onChange={(v) => setRow(i, v)} placeholder="Versione normale corrispondente" />
                      </div>
                    </div>
                    {pairs.some((p) => p.alts.includes(r.name)) && (
                      <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => removeOne(r.name)}>✕</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ borderTop: "1px solid var(--border-soft)", marginTop: 14, paddingTop: 12 }}>
            <div className="f-mono" style={{ fontSize: 10.5, color: "var(--text-faint)", marginBottom: 6 }}>
              AGGIUNGI A MANO
            </div>
            <p style={{ fontSize: 11.5, color: "var(--text-faint)", marginBottom: 8 }}>
              Serve solo per i collab usciti in un <strong>unico elemento</strong> (es. Frodo): senza varianti
              elementali non vengono riconosciuti in automatico. Una volta aggiunta, la coppia resta nell&apos;elenco qui sopra.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 230 }}>
                <MonsterCrest key={`ma-${manualAlt}-${iconKey}`} name={manualAlt} size={32} noSplit />
                <div style={{ flex: 1 }}>
                  <MonsterPicker value={manualAlt} onChange={setManualAlt} placeholder="Mostro collab" />
                </div>
              </div>
              <span style={{ color: "var(--text-faint)" }}>→</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 230 }}>
                <MonsterCrest key={`mc-${manualCanonical}-${iconKey}`} name={manualCanonical} size={32} noSplit />
                <div style={{ flex: 1 }}>
                  <MonsterPicker value={manualCanonical} onChange={setManualCanonical} placeholder="Versione normale" />
                </div>
              </div>
              <button
                className="btn btn-ghost"
                disabled={!manualAlt.trim() || !manualCanonical.trim()}
                onClick={addManual}
              >
                + Aggiungi
              </button>
            </div>
          </div>
        </>
      )}
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
        {status === "loading" ? <><Spinner />Caricamento...</> : "📎 Clicca per selezionare il file .json"}
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
        ? `Ripristinato: ${data.restoredDefs} Difese, ${data.restoredCounters} Counter.`
        : data.error);
    };
    reader.readAsText(file);
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="section-label">Scarica backup</div>
        <p style={{ color: "var(--text-faint)", fontSize: 12.5, marginBottom: 12 }}>
          Scarica un file .json con tutte le Difese e i Counter così come sono ora (niente utenti/password/roster
          dentro). Tienilo da parte — se qualcosa va storto, lo ricarichi qui sotto e torna tutto come prima.
        </p>
        <button className="btn btn-gold" onClick={download}>⬇ Scarica backup</button>
      </div>

      <div className="card">
        <div className="section-label">Ripristina da backup</div>
        <p style={{ color: "var(--text-faint)", fontSize: 12.5, marginBottom: 12 }}>
          ⚠️ Sovrascrive completamente Difese e Counter con quello che c'è nel file (utenti e roster non vengono
          toccati). Usalo solo per tornare a uno stato precedente conosciuto.
        </p>
        <label
          style={{
            display: "block", border: "1.5px dashed var(--border)", borderRadius: 8, padding: "14px 12px",
            textAlign: "center", cursor: "pointer", color: "var(--text-muted)", fontSize: 12.5, background: "var(--bg-soft)",
          }}
        >
          {status === "loading" ? <><Spinner />Ripristino in corso...</> : "📎 Clicca per selezionare il file di backup"}
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
  const [dupInfo, setDupInfo] = useState(null);
  const [cleaning, setCleaning] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState("");
  const [syncingMon, setSyncingMon] = useState(false);
  const [syncMonMsg, setSyncMonMsg] = useState("");
  const [merging, setMerging] = useState(false);
  const [mergeMsg, setMergeMsg] = useState("");
  const [reviewGroups, setReviewGroups] = useState([]);
  const [resyncExamples, setResyncExamples] = useState([]);
  const [maintMsg, setMaintMsg] = useState("");

  function load() {
    setLoading(true);
    fetch("/api/admin/healthcheck").then((r) => r.json()).then((d) => {
      setChecks(d.checks || null);
      setLoading(false);
    });
  }

  function loadDupInfo() {
    fetch("/api/admin/maintenance").then((r) => r.json()).then((d) => setDupInfo(d));
  }

  useEffect(() => { load(); loadDupInfo(); }, []);

  async function mergeEquivalent() {
    setMerging(true);
    setMergeMsg("");
    const res = await fetch("/api/admin/maintenance", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "merge_equivalent_defs" }),
    });
    const data = await res.json();
    setMerging(false);
    if (!res.ok) return setMergeMsg(data.error);
    setMergeMsg(
      data.groups === 0
        ? "Nessuna Difesa da unire: nessuna coppia collab registrata combacia con Difese esistenti."
        : `${data.mergedDefs} Difese unite in ${data.groups} gruppi, ${data.movedCounters} counter spostati. Ora lancia "Pulisci counter doppi".`
    );
    loadDupInfo();
  }

  async function cleanupDuplicates() {
    setCleaning(true);
    const res = await fetch("/api/admin/maintenance", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cleanup_duplicates" }),
    });
    const data = await res.json();
    setCleaning(false);
    if (!res.ok) return setMaintMsg(data.error);
    const review = data.needsReview || [];
    setMaintMsg(
      `${data.removed} counter doppi eliminati (${data.groupsFound} gruppi trovati).` +
      (review.length ? ` ${review.length} gruppi NON toccati: contengono più counter scritti a mano.` : "")
    );
    setReviewGroups(review);
    loadDupInfo();
  }

  async function syncMonsters() {
    setSyncingMon(true);
    setSyncMonMsg("");
    const res = await fetch("/api/admin/maintenance", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync_monsters" }),
    });
    const data = await res.json();
    setSyncingMon(false);
    setSyncMonMsg(res.ok ? `Bestiario aggiornato: ${data.count} mostri sincronizzati da swarfarm.` : data.error);
    if (res.ok) {
      // Le liste sono in cache condivisa: senza svuotarle, i mostri nuovi non
      // comparirebbero nelle icone e nella tabella collab fino a un reload.
      invalidateMonsterCache();
      invalidateTwinCache();
      window.dispatchEvent(new Event(MONSTERS_SYNCED_EVENT));
    }
  }

  async function backfillNicknames() {
    setBackfilling(true);
    setBackfillMsg("");
    const res = await fetch("/api/admin/maintenance", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "backfill_log_nicknames" }),
    });
    const data = await res.json();
    setBackfilling(false);
    if (!res.ok) return setBackfillMsg(data.error);
    setBackfillMsg(
      data.checked === 0
        ? "Nessun counter da Siege Log trovato."
        : `${data.updated} counter aggiornati col nick su ${data.checked} da Siege Log. ${data.noData} senza nick disponibile (serve reimportare il log con la versione nuova del sito).`
    );
  }

  async function resyncFromVariants() {
    setResyncing(true);
    const res = await fetch("/api/admin/maintenance", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resync_from_variants" }),
    });
    const data = await res.json();
    setResyncing(false);
    if (!res.ok) return setMaintMsg(data.error);
    setMaintMsg(`${data.updated} counter aggiornati su ${data.checked} controllati (${data.foundData} avevano dati grezzi disponibili).`);
    setResyncExamples(data.examples || []);
  }

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

      <div className="section-label" style={{ marginTop: 24 }}>Manutenzione contenuti</div>
      <div className="card" style={{ marginBottom: 10 }}>
        <button className="btn btn-danger" disabled={merging} onClick={mergeEquivalent}>
          {merging && <Spinner />}🔗 Unisci Difese uguali a meno della versione collab
          {dupInfo ? ` (${dupInfo.equivalentDefGroups} gruppi trovati)` : " (...)"}
        </button>
        <p style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 8 }}>
          Difese identiche tranne che per la versione collab/normale di un mostro (es. &quot;Dark Ciri / Son Zhang Lao /
          Driana&quot; e &quot;Fiona / Son Zhang Lao / Driana&quot;): erano state create prima che la coppia fosse
          registrata. Tiene quella con più counter e ci sposta dentro gli altri. <strong>Registra prima le coppie</strong>
          nella tab Mostri, poi lancia &quot;Pulisci counter doppi&quot; qui sotto per togliere i counter ripetuti.
        </p>
        {mergeMsg && <p style={{ fontSize: 12.5, color: "var(--green)", marginTop: 8 }}>{mergeMsg}</p>}
      </div>
      <div className="card">
        <button className="btn btn-danger" disabled={cleaning} onClick={cleanupDuplicates}>
          {cleaning && <Spinner />}🧹 Pulisci counter doppi ({dupInfo ? `${dupInfo.duplicateGroups} gruppi trovati` : "..."})
        </button>
        <p style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 8 }}>
          Stesso leader e stessi 2 mostri (ordine ignorato) sulla stessa Difesa. <strong>I counter scritti a mano non
          vengono mai cancellati</strong>: si eliminano solo i doppioni generati dal Log Siege, che si rigenerano al
          prossimo import. Se in un gruppo ci sono più counter scritti a mano, non si tocca nulla e te li elenca qui
          sotto perché decida tu.
        </p>
        {maintMsg.includes("doppi") && <p style={{ fontSize: 12.5, color: "var(--green)", marginTop: 8 }}>{maintMsg}</p>}
        {reviewGroups.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div className="f-mono" style={{ fontSize: 10.5, color: "var(--ember)", marginBottom: 4 }}>DA DECIDERE A MANO</div>
            {reviewGroups.map((g, i) => (
              <div key={i} style={{ fontSize: 12, color: "var(--text-muted)", padding: "2px 0" }}>
                {g.defMonsters?.join(" / ")} → <strong>{g.offense?.join(" / ")}</strong>{" "}
                <span className="f-mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>({g.authors?.join(", ")})</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card" style={{ marginBottom: 10 }}>
        <button className="btn btn-primary" disabled={syncingMon} onClick={syncMonsters}>
          {syncingMon && <Spinner />}🔃 Sincronizza bestiario da swarfarm
        </button>
        <p style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 8 }}>
          Scarica l&apos;elenco aggiornato dei mostri (nomi, icone, accuracy base). Lancialo quando escono mostri
          nuovi o dopo un collab, altrimenti i nomi nuovi non vengono riconosciuti nei log.
        </p>
        {syncMonMsg && <p style={{ fontSize: 12.5, color: "var(--green)", marginTop: 8 }}>{syncMonMsg}</p>}
      </div>
      <div className="card" style={{ marginBottom: 10 }}>
        <button className="btn btn-gold" disabled={resyncing} onClick={resyncFromVariants}>
          {resyncing && <Spinner />}🔄 Recupera stat rune/artefatti nei counter già approvati
        </button>
        <button className="btn btn-gold" disabled={backfilling} onClick={backfillNicknames} style={{ marginTop: 8 }}>
          {backfilling && <Spinner />}👤 Aggiungi il nick del proprietario ai counter da Siege Log
        </button>
        {backfillMsg && <p style={{ fontSize: 12.5, color: "var(--green)", marginTop: 8 }}>{backfillMsg}</p>}
        <p style={{ fontSize: 11.5, color: "var(--red)", marginTop: 8 }}>
          ⚠️ Finestra di tempo limitata: funziona solo finché non fai "Fine Season" (che cancella i dati grezzi da
          cui recuperare). Usalo dopo ogni aggiornamento del sito per riportare i counter già approvati
          alle stat più aggiornate — dopo Fine Season non sarà più possibile.
        </p>
        {maintMsg.includes("controllati") && (
          <div style={{ marginTop: 8 }}>
            <p style={{ fontSize: 12.5, color: "var(--green)" }}>{maintMsg}</p>
            {resyncExamples.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--text-faint)" }}>
                <div>Esempi di cosa è successo (max 5):</div>
                {resyncExamples.map((ex, i) => (
                  <div key={i} style={{ marginTop: 4, padding: "4px 8px", background: "var(--bg-soft)", borderRadius: 4 }}>
                    {ex.offense?.join("/")} contro {ex.defense?.join("/")} — {ex.reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
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

      {status === "loading" && <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 10 }}><Spinner />Importazione in corso...</p>}
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

// Limite FISSO di Vercel per le funzioni serverless: 4.5MB per richiesta,
// non aggirabile via configurazione. Un log SWEX/SWProxy di una siege
// intera può facilmente superarlo (visto anche 8+ MB). Soluzione: lo
// spezziamo qui nel browser in pezzi via via più piccoli, SENZA MAI
// tagliare a metà uno scambio "API Command: ... Response: ...", e li
// mandiamo uno alla volta allo stesso endpoint.
const MAX_CHUNK_BYTES = 3 * 1024 * 1024; // 3MB di margine sotto il limite reale

function splitLogIntoChunks(logText) {
  const blocks = logText.split(/(?=API Command:)/g).filter(Boolean);
  if (blocks.length <= 1) return [logText];
  const chunks = [];
  let current = "";
  for (const block of blocks) {
    const candidate = current + block;
    if (current && new Blob([candidate]).size > MAX_CHUNK_BYTES) {
      chunks.push(current);
      current = block;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function SiegeLogImportSection() {
  const [logText, setLogText] = useState("");
  const [status, setStatus] = useState("idle"); // idle | reading | loading | done | error
  const [progress, setProgress] = useState(null); // { part, total }
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  function handleFile(file) {
    setStatus("reading");
    setError(""); setResult(null);
    const reader = new FileReader();
    reader.onload = () => { setLogText(reader.result); setStatus("idle"); };
    reader.onerror = () => { setStatus("error"); setError("Non sono riuscito a leggere il file."); };
    reader.readAsText(file);
  }

  async function sendChunk(chunk) {
    const res = await fetch("/api/admin/import-siege-log", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logText: chunk }),
    });
    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      // La risposta non è JSON: quasi sempre un errore non gestito o (più
      // raro ora che spezziamo il log) un timeout. Messaggio chiaro invece
      // del generico errore del browser quando prova a interpretare come
      // JSON qualcosa che non lo è.
      throw new Error("Il server non ha risposto in tempo utile o è andato in errore imprevisto. Riprova tra poco.");
    }
    if (!res.ok) throw new Error(data.error || "Errore sconosciuto");
    return data;
  }

  async function submit() {
    if (!logText.trim()) return;
    setStatus("loading");
    setError("");
    setResult(null);
    setProgress(null);
    try {
      const chunks = splitLogIntoChunks(logText);
      const totals = { entriesFound: 0, matchupsFound: 0, winningMatchups: 0, crossPlayerNewBattles: 0, crossPlayerTouchedPairs: 0 };
      for (let i = 0; i < chunks.length; i++) {
        if (chunks.length > 1) setProgress({ part: i + 1, total: chunks.length });
        const data = await sendChunk(chunks[i]);
        totals.entriesFound += data.entriesFound || 0;
        totals.matchupsFound += data.matchupsFound || 0;
        totals.winningMatchups += data.winningMatchups || 0;
        totals.crossPlayerNewBattles += data.crossPlayerNewBattles || 0;
        totals.crossPlayerTouchedPairs += data.crossPlayerTouchedPairs || 0;
      }
      setResult(totals);
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setError(String(e.message || e));
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="card">
      <div className="section-label">Importa da log SWEX (Siege)</div>
      <p style={{ color: "var(--text-faint)", fontSize: 12.5, marginBottom: 12 }}>
        In gioco, apri il "Battle Log" di ogni player della gilda (un click a testa — non serve aprire ogni singolo
        replay). Poi carica qui il log grezzo di SWEX/SWProxy (es. "full_log.txt"). Ogni battaglia (vinta o persa)
        alimenta il database cross-player condiviso — nel tempo, se più persone caricano qui i propri log, emergono i
        counter migliori a prescindere da chi li ha usati (soglia 90% di vittorie), visibili e approvabili nel tab
        "Approvazioni Siege Log" (anche in blocco, con "Approva selezionati").
      </p>
      <label
        style={{
          display: "block", border: "1.5px dashed var(--border)", borderRadius: 8, padding: "14px 12px",
          textAlign: "center", cursor: status === "loading" || status === "reading" ? "default" : "pointer", color: "var(--text-muted)", fontSize: 12.5, background: "var(--bg-soft)",
          marginBottom: 10, opacity: status === "loading" || status === "reading" ? 0.6 : 1,
        }}
      >
        {status === "reading" ? <><Spinner />Lettura del file in corso...</> : "📎 Clicca per selezionare il file di log (.txt)"}
        <input type="file" accept=".txt,text/plain" disabled={status === "loading" || status === "reading"} style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </label>
      <textarea
        value={logText}
        onChange={(e) => setLogText(e.target.value)}
        placeholder="...oppure incolla qui il testo del log"
        rows={4}
        disabled={status === "loading" || status === "reading"}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 11, marginBottom: 10 }}
      />
      <button className="btn btn-gold" onClick={submit} disabled={status === "loading" || !logText.trim()}>
        {status === "loading" && <Spinner />}
        {status === "loading" ? (progress ? `Parte ${progress.part} di ${progress.total}...` : "Analisi in corso...") : "Importa dal log"}
      </button>
      {status === "loading" && (
        <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: 8 }}>
          {progress
            ? `Log grande, diviso in ${progress.total} parti per rispettare il limite di Vercel — non chiudere la pagina.`
            : "Con log grandi (centinaia di battaglie) può richiedere anche 30-40 secondi — non chiudere la pagina."}
        </p>
      )}

      {status === "error" && <p style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>{error}</p>}
      {status === "done" && result && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <p style={{ color: "var(--green)" }}>
            Trovati {result.entriesFound} attacchi, {result.matchupsFound} accoppiate diverse, {result.winningMatchups} con oltre il 90% di vittorie.
          </p>
          <p style={{ color: "var(--text-muted)" }}>
            Database cross-player: {result.crossPlayerNewBattles} battaglie nuove ({result.crossPlayerTouchedPairs} coppie difesa/counter aggiornate) — vai su "Approvazioni Siege Log" per approvarle.
          </p>
        </div>
      )}
    </div>
  );
}

function SiegeStatsProposalsTab({ isAdmin }) {
  const [subTab, setSubTab] = useState("pending"); // pending | update_available | approved | rejected
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const [seasonId, setSeasonId] = useState("");
  const [confirmSeasonEnd, setConfirmSeasonEnd] = useState(false);
  const [seasonMsg, setSeasonMsg] = useState("");
  const [purging, setPurging] = useState(false);
  const [purgeMsg, setPurgeMsg] = useState("");
  const [archives, setArchives] = useState([]);
  const [deletingArchive, setDeletingArchive] = useState(null);
  const [editingProposal, setEditingProposal] = useState(null);
  const [selectedProposals, setSelectedProposals] = useState(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);

  async function purgeBelowThreshold() {
    setPurging(true);
    setPurgeMsg("");
    const res = await fetch("/api/admin/siege-stats/proposals", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "purge_below_threshold" }),
    });
    const data = await res.json();
    setPurging(false);
    if (!res.ok) return setPurgeMsg(data.error);
    setPurgeMsg(`${data.purged} proposal sotto il 90% spostate in "Rifiutate".`);
    if (subTab === "pending") load();
  }

  // Contatore di richiesta: se cambi tab mentre una richiesta è ancora in
  // volo, la risposta vecchia deve essere SCARTATA. Senza questo, la
  // risposta più lenta (di solito "Approvate", che ha molti più elementi)
  // arrivava dopo e sovrascriveva la lista di un'altra tab — si finiva a
  // vedere i counter approvati sotto l'etichetta "Da rivedere", col rischio
  // concreto di premere "Rifiuta e rimuovi selezionati" su counter sani.
  const loadReqId = useRef(0);

  async function load() {
    const reqId = ++loadReqId.current;
    setLoading(true);
    const res = await fetch(`/api/admin/siege-stats/proposals?status=${subTab}`);
    const data = await res.json();
    if (reqId !== loadReqId.current) return; // risposta superata, ignorala
    setProposals(data.proposals || []);
    setLoading(false);
  }

  useEffect(() => { load(); setSelectedProposals(new Set()); }, [subTab]);

  function toggleProposal(key) {
    setSelectedProposals((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleSelectAllProposals() {
    setSelectedProposals((prev) => {
      const allKeys = proposals.map((p) => `${p.defK}::${p.counterK}`);
      return prev.size === allKeys.length ? new Set() : new Set(allKeys);
    });
  }

  // Generico: funziona per qualunque azione sulle proposal selezionate
  // (approve/dismiss/unpublish/reject/delete_proposal) — un solo posto per
  // tutti i pulsanti "in blocco" del tab.
  async function bulkAct(action) {
    setBulkApproving(true);
    await Promise.all([...selectedProposals].map((key) => {
      const [defK, counterK] = key.split("::");
      return fetch("/api/admin/siege-stats/proposals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defK, counterK, action }),
      });
    }));
    setBulkApproving(false);
    setSelectedProposals(new Set());
    load();
  }

  async function act(p, action) {
    setBusyKey(`${p.defK}::${p.counterK}`);
    await fetch("/api/admin/siege-stats/proposals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defK: p.defK, counterK: p.counterK, action }),
    });
    setBusyKey(null);
    load();
  }

  async function approveWithOverride(payload) {
    const res = await fetch("/api/admin/siege-stats/proposals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defK: editingProposal.defK, counterK: editingProposal.counterK, action: "approve", override: payload }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error };
    setEditingProposal(null);
    load();
    return {};
  }

  function downloadBackup() {
    window.location.href = "/api/admin/siege-stats/season";
  }

  async function doSeasonEnd() {
    setConfirmSeasonEnd(false);
    if (!seasonId.trim()) return;
    const res = await fetch("/api/admin/siege-stats/season", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seasonId }),
    });
    const data = await res.json();
    setSeasonMsg(res.ok ? `Archiviate ${data.archivedProposals} proposal sotto "${seasonId}". Tabelle svuotate.` : data.error);
    setSeasonId("");
    loadArchives();
    load();
  }

  async function loadArchives() {
    const res = await fetch("/api/admin/siege-stats/season?archives=1");
    const data = await res.json();
    setArchives(data.archives || []);
  }

  async function deleteArchive(id) {
    setDeletingArchive(id);
    await fetch(`/api/admin/siege-stats/season?seasonId=${encodeURIComponent(id)}`, { method: "DELETE" });
    setDeletingArchive(null);
    loadArchives();
  }

  useEffect(() => { if (isAdmin) loadArchives(); }, [isAdmin]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button className={`btn ${subTab === "pending" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSubTab("pending")}>In attesa</button>
        <button className={`btn ${subTab === "update_available" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSubTab("update_available")}>Aggiornamento disponibile</button>
        <button className={`btn ${subTab === "underperforming" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSubTab("underperforming")}>⚠️ Da rivedere</button>
        <button className={`btn ${subTab === "approved" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSubTab("approved")}>Approvate</button>
        <button className={`btn ${subTab === "rejected" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSubTab("rejected")}>Rifiutate</button>
      </div>

      {(subTab === "pending" || subTab === "update_available" || subTab === "underperforming" || subTab === "rejected") && (
        <div style={{ marginBottom: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {subTab === "pending" && (
            <button className="btn btn-ghost" disabled={purging} onClick={purgeBelowThreshold}>
              {purging && <Spinner />}
              🧹 Pulisci proposal sotto il 90% (create con la soglia vecchia)
            </button>
          )}
          <button className="btn btn-ghost" disabled={proposals.length === 0} onClick={toggleSelectAllProposals}>
            {selectedProposals.size === proposals.length && proposals.length > 0 ? "Deseleziona tutto" : "Seleziona tutto"}
          </button>
          {(subTab === "pending" || subTab === "update_available" || subTab === "rejected") && (
            <button className="btn btn-green" disabled={selectedProposals.size === 0 || bulkApproving} onClick={() => bulkAct("approve")}>
              {bulkApproving && <Spinner />}✓ Approva selezionati ({selectedProposals.size})
            </button>
          )}
          {subTab === "underperforming" && (
            <>
              <button className="btn btn-ghost" disabled={selectedProposals.size === 0 || bulkApproving} onClick={() => bulkAct("dismiss")}>
                {bulkApproving && <Spinner />}Ignora selezionati ({selectedProposals.size})
              </button>
              <button className="btn btn-danger" disabled={selectedProposals.size === 0 || bulkApproving} onClick={() => bulkAct("unpublish")}>
                🗑 Rifiuta e rimuovi selezionati ({selectedProposals.size})
              </button>
            </>
          )}
          {subTab === "rejected" && (
            <button className="btn btn-danger" disabled={selectedProposals.size === 0 || bulkApproving} onClick={() => bulkAct("delete_proposal")}>
              🗑 Elimina definitivamente selezionati ({selectedProposals.size})
            </button>
          )}
        </div>
      )}
      {purgeMsg && subTab === "pending" && <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 10 }}>{purgeMsg}</p>}

      {loading ? (
        <p style={{ color: "var(--text-faint)" }}>Caricamento...</p>
      ) : proposals.length === 0 ? (
        <p style={{ color: "var(--text-faint)" }}>Nessuna proposal in questa categoria.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {proposals.map((p) => (
            <div key={`${p.defK}::${p.counterK}`} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {(subTab === "pending" || subTab === "update_available" || subTab === "underperforming" || subTab === "rejected") && (
                    <input
                      type="checkbox"
                      checked={selectedProposals.has(`${p.defK}::${p.counterK}`)}
                      onChange={() => toggleProposal(`${p.defK}::${p.counterK}`)}
                      style={{ marginRight: 4 }}
                    />
                  )}
                  {p.offenseNames?.map((m, i) => <MonsterCrest key={`o${i}`} name={m} size={30} lead={i === 0} />)}
                  <strong>{p.offenseNames?.join(" / ")}</strong>
                  <span style={{ color: "var(--text-faint)" }}>contro</span>
                  {p.defenseNames?.map((m, i) => <MonsterCrest key={`d${i}`} name={m} size={30} />)}
                  <strong>{p.defenseNames?.join(" / ")}</strong>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {Math.round((p.currentWinRate || 0) * 100)}% vittorie attuali
                  {p.status === "update_available" && (
                    <span style={{ color: "var(--gold)" }}> (approvato a {Math.round((p.approvedWinRate || 0) * 100)}%)</span>
                  )}
                  {p.status === "underperforming" && (
                    <span style={{ color: "var(--red)" }}> (era stato approvato a {Math.round((p.approvedWinRate || 0) * 100)}%, ora sotto il 90%)</span>
                  )}
                </div>
              </div>
              {p.bestVariant && (
                <div style={{ marginTop: 8 }}>
                  <p style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                    Variante migliore: {p.bestVariant.wins}/{p.bestVariant.total} vittorie con questa build.
                  </p>
                  {p.bestVariant.units?.some((u) => u.runes || u.artifactLeft?.length || u.artifactRight?.length) ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                      {p.bestVariant.units.map((u, i) => (
                        <div key={i} style={{ fontSize: 12, background: "var(--bg-soft)", borderRadius: 6, padding: "6px 8px" }}>
                          <strong>{u.name}</strong>
                          <span style={{ color: "var(--text-faint)" }}> — Rune: </span>{u.runes || "—"}
                          {u.artifactLeft?.length > 0 && <span style={{ color: "var(--text-faint)" }}> · Attributo: {u.artifactLeft.join(", ")}</span>}
                          {u.artifactRight?.length > 0 && <span style={{ color: "var(--text-faint)" }}> · Tipo: {u.artifactRight.join(", ")}</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: 11.5, color: "var(--text-faint)", fontStyle: "italic" }}>
                      Nessuna build trovata (nessuno ha ancora aperto il replay completo di questa battaglia) — rune/artefatti da completare a mano dopo l'approvazione.
                    </p>
                  )}
                </div>
              )}
              {(subTab === "pending" || subTab === "update_available") && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button className="btn btn-gold" disabled={busyKey === `${p.defK}::${p.counterK}`} onClick={() => act(p, "approve")}>
                    {subTab === "update_available" ? "Aggiorna approvazione" : "Approva"}
                  </button>
                  <button className="btn btn-ghost" disabled={busyKey === `${p.defK}::${p.counterK}`} onClick={() => setEditingProposal(p)}>✎ Modifica e approva</button>
                  <button className="btn btn-danger" disabled={busyKey === `${p.defK}::${p.counterK}`} onClick={() => act(p, "reject")}>Rifiuta</button>
                </div>
              )}
              {subTab === "underperforming" && (
                <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                  {p.defId && (
                    <a className="btn btn-ghost" href={`/defs/${p.defId}`} target="_blank" rel="noopener noreferrer">Vai alla Difesa</a>
                  )}
                  <button className="btn btn-gold" disabled={busyKey === `${p.defK}::${p.counterK}`} onClick={() => setEditingProposal(p)}>✎ Modifica e approva</button>
                  <button className="btn btn-ghost" disabled={busyKey === `${p.defK}::${p.counterK}`} onClick={() => act(p, "dismiss")}>Ignora (tienilo com'è)</button>
                  <button className="btn btn-danger" disabled={busyKey === `${p.defK}::${p.counterK}`} onClick={() => act(p, "unpublish")}>🗑 Rifiuta e rimuovi dal sito</button>
                </div>
              )}
              {subTab === "rejected" && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button className="btn btn-gold" disabled={busyKey === `${p.defK}::${p.counterK}`} onClick={() => act(p, "approve")}>Approva</button>
                  <button className="btn btn-ghost" disabled={busyKey === `${p.defK}::${p.counterK}`} onClick={() => setEditingProposal(p)}>✎ Modifica e approva</button>
                  <button className="btn btn-danger" disabled={busyKey === `${p.defK}::${p.counterK}`} onClick={() => act(p, "delete_proposal")}>🗑 Elimina definitivamente</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="section-label">Fine Season</div>
          <p style={{ color: "var(--text-faint)", fontSize: 12.5, marginBottom: 12 }}>
            Archivia tutte le statistiche cross-player (non le Difese/Counter già pubblicati, quelli restano) sotto
            un nome stagione, poi svuota i contatori per ripartire puliti. Scarica prima un backup se vuoi una copia
            extra oltre all'archivio automatico.
          </p>
          <button className="btn btn-ghost" style={{ marginBottom: 10 }} onClick={downloadBackup}>⬇ Scarica backup statistiche</button>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={seasonId}
              onChange={(e) => setSeasonId(e.target.value)}
              placeholder='es. "2026S15"'
              style={{ maxWidth: 200 }}
            />
            <button className="btn btn-gold" disabled={!seasonId.trim()} onClick={() => setConfirmSeasonEnd(true)}>Archivia e svuota</button>
          </div>
          {seasonMsg && <p style={{ fontSize: 13, color: "var(--green)", marginTop: 8 }}>{seasonMsg}</p>}

          {archives.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 6 }}>Archiviazioni esistenti (es. quelle di prova possono essere eliminate):</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {archives.map((a) => (
                  <div key={a.seasonId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, background: "var(--bg-soft)", borderRadius: 6, padding: "6px 10px" }}>
                    <span>{a.seasonId} — {a.proposals?.length ?? 0} proposal, {new Date(a.archivedAt).toLocaleString("it-IT")}</span>
                    <button className="btn btn-ghost" disabled={deletingArchive === a.seasonId} onClick={() => deleteArchive(a.seasonId)}>🗑 Elimina</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {confirmSeasonEnd && (
        <ConfirmModal
          message={`Archiviare tutte le statistiche cross-player sotto "${seasonId}" e svuotare i contatori? Le Difese/Counter già pubblicati non vengono toccati. Non si può annullare.`}
          confirmLabel="Archivia e svuota"
          onConfirm={doSeasonEnd}
          onCancel={() => setConfirmSeasonEnd(false)}
        />
      )}
      {editingProposal && (
        <Modal title={`Modifica e approva — ${editingProposal.offenseNames.join(" / ")} contro ${editingProposal.defenseNames.join(" / ")}`} onClose={() => setEditingProposal(null)} wide>
          <CounterForm
            defMonsters={editingProposal.defenseNames}
            initial={{
              offense: editingProposal.offenseNames,
              lead: editingProposal.offenseNames[0],
              turnOrder: editingProposal.offenseNames,
              units: editingProposal.bestVariant?.units || editingProposal.offenseNames.map((name) => ({
                name, lead: false, runes: "", stats: "", statsFlexible: false, statsMinText: "",
                artifactLeft: [], artifactRight: [], notes: [""],
              })),
              focus: [],
              strategy: `Proposto dal sistema Siege Log: ${Math.round((editingProposal.currentWinRate || 0) * 100)}% vittorie su tutte le sieges osservate. Controlla comunque rune/artefatti/strategia.`,
              warning: "",
              video: null,
              images: [],
            }}
            onSubmit={approveWithOverride}
            onCancel={() => setEditingProposal(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function ContentTab() {
  const [subTab, setSubTab] = useState("pending"); // pending | duplicates | all

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className={`btn ${subTab === "pending" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSubTab("pending")}>In attesa di approvazione</button>
        <button className={`btn ${subTab === "duplicates" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSubTab("duplicates")}>Difese doppie</button>
        <button className={`btn ${subTab === "all" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSubTab("all")}>Tutte / elimina in blocco</button>
      </div>
      {subTab === "pending" && <PendingApprovalsSection />}
      {subTab === "duplicates" && <DuplicateDefsSection />}
      {subTab === "all" && <AllContentSection />}
    </div>
  );
}

function DuplicateDefsSection() {
  const [defs, setDefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(null);
  const [canonicalMap, setCanonicalMap] = useState({});

  function load() {
    setLoading(true);
    Promise.all([
      fetch("/api/defs").then((r) => r.json()),
      fetch("/api/admin/monsters/twins").then((r) => r.json()),
    ]).then(([d, tw]) => {
      const map = {};
      for (const p of tw.pairs || []) {
        map[normalizeMonsterName(p.canonical)] = p.canonical;
        for (const a of p.alts) map[normalizeMonsterName(a)] = p.canonical;
      }
      setCanonicalMap(map);
      setDefs(d.defs || []);
      setLoading(false);
    });
  }
  useEffect(load, []);

  // Stesso mostro conta uguale a prescindere da ordine/accenti/maiuscole —
  // stessa logica usata per il roster e la ricerca mostri.
  function keyFor(d) {
    // Passa per il nome canonico: due difese che differiscono solo per la
    // versione (collab o normale) dello stesso mostro sono la STESSA difesa
    // e vanno riconosciute come doppie, altrimenti restano separate per
    // sempre anche dopo aver registrato la coppia.
    return d.monsters
      .map((m) => normalizeMonsterName(canonicalMap[normalizeMonsterName(m)] || m))
      .sort()
      .join("|");
  }

  const groups = {};
  for (const d of defs) {
    const k = keyFor(d);
    (groups[k] ||= []).push(d);
  }
  const duplicateGroups = Object.values(groups).filter((g) => g.length > 1);

  async function mergeGroup(group) {
    // Tiene quella con più Counter (a parità, la prima creata).
    const sorted = [...group].sort((a, b) => b.counters.length - a.counters.length || a.createdAt - b.createdAt);
    const [keep, ...sources] = sorted;
    setMerging(keep.id);
    await fetch("/api/admin/merge-defs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keepId: keep.id, sourceIds: sources.map((s) => s.id) }),
    });
    setMerging(null);
    load();
  }

  return (
    <div>
      <p style={{ color: "var(--text-faint)", fontSize: 12.5, marginBottom: 16 }}>
        ⚠️ Consiglio: fai un <strong>Backup</strong> (tab apposita qui sopra) prima di unire — l'unione non si può
        annullare.
      </p>
      {loading && <p style={{ color: "var(--text-faint)", fontSize: 13.5 }}>Controllo...</p>}
      {!loading && duplicateGroups.length === 0 && (
        <p style={{ color: "var(--text-faint)", fontSize: 13.5 }}>Nessuna Difesa doppia trovata. 🎉</p>
      )}
      {duplicateGroups.map((group, i) => (
        <div key={i} className="card" style={{ marginBottom: 12 }}>
          <div className="section-label" style={{ marginBottom: 8 }}>
            {group.length} copie di questa Difesa ({group.reduce((s, d) => s + d.counters.length, 0)} counter in totale)
          </div>
          {group.map((d) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              {d.monsters.map((m, j) => <MonsterCrest key={j} name={m} size={30} />)}
              <span style={{ fontSize: 13 }}>{d.monsters.join(" / ")}</span>
              <span className="f-mono" style={{ fontSize: 10.5, color: "var(--text-faint)" }}>({d.counters.length} counter)</span>
            </div>
          ))}
          <button className="btn btn-primary" disabled={merging} onClick={() => mergeGroup(group)} style={{ marginTop: 6 }}>
            {merging ? "Unione in corso..." : "🔗 Unisci tutte in una"}
          </button>
        </div>
      ))}
    </div>
  );
}

function PendingApprovalsSection() {
  const [defs, setDefs] = useState([]);
  const router = useRouter();
  const searchParams = useSearchParams();
  // La ricerca vive nell'URL (?q=...), non solo in memoria — così tornando
  // indietro o ricaricando la pagina si ritrova la ricerca fatta.
  const [query, setQuery] = useState(searchParams.get("q") || "");
  useEffect(() => { setQuery(searchParams.get("q") || ""); }, [searchParams]);
  function updateQuery(v) {
    setQuery(v);
    const params = new URLSearchParams(searchParams.toString());
    if (v) params.set("q", v); else params.delete("q");
    router.replace(`/admin${params.toString() ? `?${params}` : ""}`, { scroll: false });
  }
  const [managerNicknames, setManagerNicknames] = useState([]);
  const [expanded, setExpanded] = useState(new Set());
  const [editingDef, setEditingDef] = useState(null);
  const [editingCounter, setEditingCounter] = useState(null);
  const [addingCounterToDef, setAddingCounterToDef] = useState(null);
  const [counterTemplate, setCounterTemplate] = useState(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [confirmRejectDef, setConfirmRejectDef] = useState(null);
  const [confirmRejectCounter, setConfirmRejectCounter] = useState(null);

  useEffect(() => {
    fetch("/api/managers").then((r) => r.json()).then((d) => setManagerNicknames(d.nicknames || [])).catch(() => {});
  }, []);

  function load() {
    fetch("/api/defs").then((r) => r.json()).then((d) => {
      setDefs(d.defs || []);
      // Apre da sole le Difese che hanno qualcosa da approvare, così si
      // vede subito il contenuto senza dover cliccare per espandere.
      setExpanded(new Set((d.defs || []).filter((def) => def.status === "pending" || def.counters.some((c) => c.status === "pending")).map((def) => def.id)));
    });
  }
  useEffect(load, []);

  function toggle(id) {
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

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
  async function rejectCounter(defId, id) {
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
  async function submitAddCounter(payload) {
    const res = await fetch(`/api/defs/${addingCounterToDef.id}/counters`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error };
    setAddingCounterToDef(null);
    setCounterTemplate(null);
    load();
    return {};
  }

  const totalPending = defs.filter((d) => d.status === "pending").length + defs.reduce((sum, d) => sum + d.counters.filter((c) => c.status === "pending").length, 0);

  const qTokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  // Ogni "parola" cercata (anche più di una — 1, 2 o tutti e 3 i mostri di
  // una squadra) deve trovarsi in ALMENO uno dei nomi, non serve scriverli
  // nell'ordine esatto né tutti insieme.
  function teamMatchesQuery(names) {
    return qTokens.every((t) => names.some((m) => m.toLowerCase().includes(t)));
  }
  const filteredDefs = (qTokens.length
    ? defs.filter((d) => teamMatchesQuery(d.monsters) || d.counters.some((c) => teamMatchesQuery(c.offense)))
    : defs
  ).slice().sort((a, b) => {
    const aNeeds = a.status === "pending" || a.counters.some((c) => c.status === "pending");
    const bNeeds = b.status === "pending" || b.counters.some((c) => c.status === "pending");
    if (aNeeds !== bNeeds) return aNeeds ? -1 : 1; // chi ha bisogno di attenzione va prima
    return (a.monsters[0] || "").localeCompare(b.monsters[0] || "");
  });

  return (
    <div>
      <input
        placeholder="Cerca per mostro (difesa o counter)..."
        value={query}
        onChange={(e) => updateQuery(e.target.value)}
        style={{ marginBottom: 14 }}
      />
      {totalPending === 0 && <p style={{ color: "var(--text-faint)", fontSize: 13.5 }}>Niente in attesa — tutto approvato. 🎉</p>}

      {filteredDefs.map((d) => {
        const pendingCounterCount = d.counters.filter((c) => c.status === "pending").length;
        const needsAttention = d.status === "pending" || pendingCounterCount > 0;
        if (!needsAttention && d.counters.length === 0) return null;
        return (
          <div key={d.id} style={{ borderBottom: "1px solid var(--border-soft)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: needsAttention ? "var(--ember-soft)" : "var(--bg-soft)" }}>
              <button onClick={() => toggle(d.id)} style={{ background: "none", border: "none", color: "var(--text-faint)" }}>
                {expanded.has(d.id) ? "▼" : "▶"}
              </button>
              {d.monsters.map((m, i) => <MonsterCrest key={i} name={m} size={30} />)}
              <span style={{ flex: 1, fontSize: 13.5 }}>{d.monsters.join(" / ")}</span>
              {d.status === "pending" && <span title="In attesa di approvazione" style={{ color: "var(--ember)", fontWeight: 700 }}>❗</span>}
              {d.status === "pending" ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-ghost" onClick={() => setEditingDef(d)}>✎</button>
                  <button className="btn btn-ghost" onClick={() => setAddingCounterToDef(d)}>+ Counter</button>
                  <button className="btn btn-ghost" onClick={() => { setAddingCounterToDef(d); setShowTemplatePicker(true); }}>📋 Da esistente</button>
                  <button className="btn btn-green" onClick={() => approveDef(d.id)}>✓ Approva</button>
                  <button className="btn btn-danger" onClick={() => setConfirmRejectDef(d)}>✕ Rifiuta</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button className="btn btn-ghost" onClick={() => setEditingDef(d)}>✎</button>
                  <button className="btn btn-ghost" onClick={() => setAddingCounterToDef(d)}>+ Counter</button>
                  <button className="btn btn-ghost" onClick={() => { setAddingCounterToDef(d); setShowTemplatePicker(true); }}>📋 Da esistente</button>
                  {pendingCounterCount > 0 && <span className="badge badge-pending">{pendingCounterCount} counter in attesa</span>}
                </div>
              )}
            </div>

            {expanded.has(d.id) && d.counters.map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 12px 8px 40px",
                  background: c.status === "pending" ? "rgba(255,106,53,.06)" : "transparent",
                }}
              >
                {(c.lead ? [c.lead, ...c.offense.filter((m) => m !== c.lead)] : c.offense).map((m, i) => <MonsterCrest key={i} name={m} size={28} lead={m === c.lead} />)}
                {c.units?.[3] && <MonsterCrest name={c.units[3].name} size={28} />}
                <span style={{ flex: 1, fontSize: 12.5 }}>{c.offense.join(" · ")}{c.units?.[3] && ` / ${c.units[3].name}`}</span>
                {!c.units?.some((u) => u.runes || u.artifactLeft?.length || u.artifactRight?.length) && (
                  <span className="badge" style={{ color: "var(--gold)", border: "1px solid var(--gold)" }}>⚠️ Rune mancanti</span>
                )}
                <span className="f-mono" style={{ fontSize: 10, color: "var(--text-faint)" }}>{formatNickname(counterAuthorLabel(c), managerNicknames.includes(c.authorNickname))}</span>
                {c.status === "approved" && c.approvedByNickname && c.approvedByNickname !== c.authorNickname && (
                  <span className="f-mono" style={{ fontSize: 10, color: "var(--green)" }}>
                    · Appr. da {formatNickname(displayAuthorName(c.approvedByNickname), managerNicknames.includes(c.approvedByNickname))}
                  </span>
                )}
                {c.status === "pending" && <span title="In attesa di approvazione" style={{ color: "var(--ember)", fontWeight: 700 }}>❗</span>}
                {c.status === "pending" ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-ghost" onClick={() => setEditingCounter({ ...c, __defMonsters: d.monsters })}>✎</button>
                    <button className="btn btn-green" onClick={() => approveCounter(c.id)}>✓</button>
                    <button className="btn btn-danger" onClick={() => setConfirmRejectCounter(c)}>✕</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button className="btn btn-ghost" onClick={() => setEditingCounter({ ...c, __defMonsters: d.monsters })}>✎</button>
                    <button className="btn btn-danger" onClick={() => setConfirmRejectCounter(c)}>🗑</button>
                    <span className="badge badge-approved">approvato</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}

      {editingDef && (
        <Modal title={`Modifica difesa — ${editingDef.monsters.join(" / ")}`} onClose={() => setEditingDef(null)}>
          <DefForm initial={editingDef} onSubmit={submitEditDef} onCancel={() => setEditingDef(null)} />
        </Modal>
      )}
      {editingCounter && (
        <Modal title="Modifica counter" onClose={() => setEditingCounter(null)} wide>
          <CounterForm defMonsters={editingCounter.__defMonsters || editingCounter.offense} initial={editingCounter} isEdit onSubmit={submitEditCounter} onCancel={() => setEditingCounter(null)} />
        </Modal>
      )}
      {addingCounterToDef && !showTemplatePicker && (
        <Modal title={`Aggiungi counter — ${addingCounterToDef.monsters.join(" / ")}`} onClose={() => { setAddingCounterToDef(null); setCounterTemplate(null); }} wide>
          <CounterForm
            defMonsters={addingCounterToDef.monsters}
            initial={counterTemplate}
            onSubmit={submitAddCounter}
            onCancel={() => { setAddingCounterToDef(null); setCounterTemplate(null); }}
          />
        </Modal>
      )}
      {showTemplatePicker && (
        <Modal title="Parti da un counter esistente" onClose={() => { setShowTemplatePicker(false); setAddingCounterToDef(null); }} wide>
          <CounterTemplatePicker
            onClose={() => { setShowTemplatePicker(false); setAddingCounterToDef(null); }}
            onSelect={(sourceCounter) => {
              // Stessa logica della home: copia tutto tranne Focus (riguardava
              // i bersagli dell'altra Difesa) e gli allegati.
              setCounterTemplate({
                units: sourceCounter.units.map((u) => ({ ...u })),
                turnOrder: [...sourceCounter.turnOrder],
                focus: [],
                strategy: sourceCounter.strategy,
                warning: sourceCounter.warning || "",
                video: sourceCounter.video || "",
                images: [],
              });
              setShowTemplatePicker(false);
            }}
          />
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
          message={
            confirmRejectCounter.status === "pending"
              ? `Rifiutare (eliminare) il counter ${confirmRejectCounter.offense.join(" / ")}? Non si può annullare.`
              : `Eliminare il counter già approvato ${confirmRejectCounter.offense.join(" / ")}? Non si può annullare.`
          }
          confirmLabel={confirmRejectCounter.status === "pending" ? "Rifiuta" : "Elimina"}
          onConfirm={() => rejectCounter(confirmRejectCounter.defId, confirmRejectCounter.id)}
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

  async function bulkApprove() {
    const counterIds = [...selectedCounters].map((key) => key.split("::")[1]);
    await Promise.all(counterIds.map((id) =>
      fetch(`/api/counters/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "approved" }) })
    ));
    setSelectedCounters(new Set());
    fetch("/api/defs").then((r) => r.json()).then((d) => setDefs(d.defs || []));
  }

  function missingBuild(c) {
    return !c.units?.some((u) => u.runes || u.artifactLeft?.length || u.artifactRight?.length);
  }

  // Quanti dei counter selezionati sono lavoro umano (scritti a mano, oppure
  // arrivati dal log ma poi corretti da qualcuno): quelli, a differenza dei
  // counter da Siege Log, non si rigenerano reimportando.
  const manualSelectedCount = defs.reduce((sum, d) => {
    const defSelected = selectedDefs.has(d.id);
    return sum + (d.counters || []).filter((c) => {
      const selected = defSelected || selectedCounters.has(`${d.id}::${c.id}`);
      const isHuman = c.authorNickname !== "Siege Log" || c.manuallyEdited;
      return selected && isHuman;
    }).length;
  }, 0);

  const pendingCounterKeys = defs.flatMap((d) => (d.counters || []).filter((c) => c.status === "pending").map((c) => `${d.id}::${c.id}`));
  const allPendingCountersSelected = pendingCounterKeys.length > 0 && pendingCounterKeys.every((k) => selectedCounters.has(k));

  function toggleSelectAllPendingCounters() {
    if (allPendingCountersSelected) {
      setSelectedCounters(new Set());
      return;
    }
    setSelectedCounters(new Set(pendingCounterKeys));
    // Espande automaticamente le Difese coinvolte, altrimenti la selezione
    // non si vede da nessuna parte finché non apri tu ogni singola card.
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const d of defs) {
        if ((d.counters || []).some((c) => c.status === "pending")) next.add(d.id);
      }
      return next;
    });
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div className="section-label">Difese e Counter ({defs.length} difese)</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={toggleSelectAll} disabled={defs.length === 0}>
            {allSelected ? "Deseleziona tutto" : "Seleziona tutte le Difese"}
          </button>
          <button className="btn btn-ghost" onClick={toggleSelectAllPendingCounters} disabled={pendingCounterKeys.length === 0}>
            {allPendingCountersSelected ? "Deseleziona counter in attesa" : `Seleziona tutti i counter in attesa (${pendingCounterKeys.length})`}
          </button>
          <button className="btn btn-green" disabled={selectedCounters.size === 0} onClick={bulkApprove}>✓ Approva selezionati ({selectedCounters.size})</button>
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
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px 7px 40px", flexWrap: "wrap" }}>
                <input type="checkbox" checked={selectedCounters.has(key)} disabled={selectedDefs.has(d.id)} onChange={() => toggleSet(setSelectedCounters, key)} />
                <span style={{ flex: 1, minWidth: 180, fontSize: 12.5 }}>{c.offense.join(" · ")}{c.units?.[3] && ` / ${c.units[3].name}`}</span>
                {/* Chi l'ha proposto e chi l'ha approvato: senza questi non si
                    capisce cosa si sta per eliminare in blocco (roba dal log,
                    rigenerabile, oppure lavoro scritto a mano da qualcuno). */}
                <span className="f-mono" style={{ fontSize: 10.5, color: "var(--text-faint)", whiteSpace: "nowrap" }}>
                  {counterAuthorLabel(c)}
                </span>
                {c.approvedByNickname && c.approvedByNickname !== c.authorNickname && (
                  <span className="f-mono" style={{ fontSize: 10.5, color: "var(--green)", whiteSpace: "nowrap" }}>
                    · Appr. da {displayAuthorName(c.approvedByNickname)}
                  </span>
                )}
                {missingBuild(c) && <span className="badge" style={{ background: "var(--gold-soft, transparent)", color: "var(--gold)", border: "1px solid var(--gold)" }}>⚠️ Rune mancanti</span>}
                <span className={`badge ${c.status === "approved" ? "badge-approved" : "badge-pending"}`}>{c.status}</span>
              </div>
            );
          })}
        </div>
      ))}
      {confirmOpen && (
        <ConfirmModal
          message={
            `Eliminare ${selectedDefs.size} difese e ${selectedCounters.size} counter singoli? Non si può annullare.` +
            (manualSelectedCount > 0
              ? `\n\n⚠️ ${manualSelectedCount} dei counter selezionati sono scritti o corretti a mano: NON si rigenerano dal log.`
              : "")
          }
          onConfirm={bulkDelete}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
