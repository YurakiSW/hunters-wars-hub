"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "../../components/Header";
import MonsterCrest from "../../components/MonsterCrest";
import Modal from "../../components/Modal";
import ConfirmModal from "../../components/ConfirmModal";
import DefForm from "../../components/DefForm";

// useSearchParams() richiede un confine <Suspense> attorno, altrimenti la
// build fallisce in fase di generazione statica ("should be wrapped in a
// suspense boundary") — per questo il contenuto vero è in un componente
// separato, avvolto qui sotto.
export default function DefsPage() {
  return (
    <Suspense fallback={null}>
      <DefsPageContent />
    </Suspense>
  );
}

function DefsPageContent() {
  const [user, setUser] = useState(null);
  const [defs, setDefs] = useState([]);
  const router = useRouter();
  const searchParams = useSearchParams();
  // La ricerca vive nell'URL (?q=...), non solo in memoria — così tornando
  // indietro dopo aver aperto una Difesa si ritrova la ricerca fatta,
  // invece di ripartire da capo con tutte le Difese.
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [showAllRest, setShowAllRest] = useState(false);
  const [confirmUnpinAll, setConfirmUnpinAll] = useState(false);
  const [unpinningAll, setUnpinningAll] = useState(false);
  useEffect(() => {
    setQuery(searchParams.get("q") || "");
  }, [searchParams]);
  function updateQuery(v) {
    setQuery(v);
    const params = new URLSearchParams(searchParams.toString());
    if (v) params.set("q", v); else params.delete("q");
    router.replace(`/defs${params.toString() ? `?${params}` : ""}`, { scroll: false });
  }
  const [showNewDef, setShowNewDef] = useState(false);
  const [editingDef, setEditingDef] = useState(null);
  const [confirmDeleteDef, setConfirmDeleteDef] = useState(null);
  const [twinPairs, setTwinPairs] = useState([]);

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
    // Coppie collab <-> normale, stesse usate da MonsterCrest per l'icona
    // mezza e mezza: servono qui per far coincidere la ricerca. Se cerchi
    // "Shahat" deve trovare anche le Difese salvate come "Wind Bayek" (e
    // viceversa) — senza questo, cercare il nome "sbagliato" dei due non
    // trova nulla anche se è davvero la stessa identica difesa.
    fetch("/api/admin/monsters/twins").then((r) => r.json()).then((d) => setTwinPairs(d.pairs || []));
  }, []);

  if (!user) return null;
  const canManage = user.role === "admin" || user.role === "reviewer";
  const sorted = [...defs].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    // "Da controllare" = la Difesa stessa è in attesa, O ha counter in
    // attesa dentro (anche se la Difesa è già approvata) — tutte queste
    // vanno sempre in fondo, mai mischiate con quelle davvero pulite.
    const aNeeds = a.status === "pending" || a.counters.some((c) => c.status === "pending");
    const bNeeds = b.status === "pending" || b.counters.some((c) => c.status === "pending");
    if (aNeeds !== bNeeds) return aNeeds ? 1 : -1;
    return (a.monsters[0] || "").localeCompare(b.monsters[0] || "");
  });
  // Un token cercato combacia con un nome salvato se sono uguali/uno
  // contiene l'altro DIRETTAMENTE, oppure se sono le due metà della stessa
  // coppia collab <-> normale (in qualunque verso, dato che sul sito può
  // essere salvato con l'uno o con l'altro nome a seconda di chi l'ha
  // giocato per primo).
  function tokenMatchesMonster(token, monsterName) {
    const m = monsterName.toLowerCase();
    if (m.includes(token)) return true;
    const pair = twinPairs.find(
      (p) => p.canonical.toLowerCase() === m || p.alts.some((a) => a.toLowerCase() === m)
    );
    if (!pair) return false;
    const allNames = [pair.canonical, ...pair.alts].map((n) => n.toLowerCase());
    return allNames.some((n) => n.includes(token));
  }
  const qTokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = qTokens.length
    ? sorted.filter((d) => qTokens.every((t) => d.monsters.some((m) => tokenMatchesMonster(t, m))))
    : sorted;

  // Le pinnate si vedono SEMPRE per intero (è il punto di fissarle in
  // cima). Le altre sono limitate a un tot, con "Mostra altre" per
  // espandere — altrimenti con centinaia di Difese la pagina diventa
  // interminabile da scorrere. Con una ricerca attiva il limite non ha
  // senso (i risultati sono già pochi e mirati): si mostrano tutti.
  const PAGE_SIZE = 24;
  const pinnedResults = filtered.filter((d) => d.pinned);
  const restResults = filtered.filter((d) => !d.pinned);
  const isSearching = qTokens.length > 0;
  const visibleRest = isSearching || showAllRest ? restResults : restResults.slice(0, PAGE_SIZE);
  const hiddenCount = restResults.length - visibleRest.length;
  const visible = [...pinnedResults, ...visibleRest];
  // Conteggio vero per "Unpin all": deve riflettere quante SARANNO
  // sbloccate (tutte, sull'intero sito), non solo quelle che la ricerca
  // sta mostrando in questo momento — altrimenti il numero sul pulsante
  // non corrisponde a quello che l'azione fa davvero.
  const totalPinnedCount = defs.filter((d) => d.pinned).length;

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

  async function unpinAll() {
    setUnpinningAll(true);
    const res = await fetch("/api/defs/unpin-all", { method: "POST" });
    setUnpinningAll(false);
    setConfirmUnpinAll(false);
    if (res.ok) setDefs((prev) => prev.map((x) => ({ ...x, pinned: false })));
  }

  async function approveDef(d) {
    const res = await fetch(`/api/defs/${d.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "approved" }),
    });
    const data = await res.json();
    if (data.def) setDefs((prev) => prev.map((x) => (x.id === d.id ? { ...x, status: data.def.status } : x)));
  }

  return (
    <div>
      <Header user={user} />
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 20px 60px" }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 22, flexWrap: "wrap" }}>
          <input placeholder="Cerca per mostro..." value={query} onChange={(e) => updateQuery(e.target.value)} style={{ maxWidth: 320 }} />
          <div style={{ flex: 1 }} />
          {user.role === "admin" && totalPinnedCount > 0 && (
            <button className="btn btn-ghost" onClick={() => setConfirmUnpinAll(true)}>
              📌 Unpin all ({totalPinnedCount})
            </button>
          )}
          <button className="btn btn-gold" onClick={() => setShowNewDef(true)}>+ Nuova difesa</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {visible.map((d) => {
            const pendingCounters = d.counters.filter((c) => c.status === "pending").length;
            // Stesso identico criterio usato per l'ordinamento qui sopra
            // (aNeeds) — se non combaciano, un colore mostra una cosa e
            // l'ordine ne applica un'altra, e le card sembrano mescolate.
            const needsAttention = d.status === "pending" || pendingCounters > 0;
            const accent = d.pinned ? "var(--gold)" : needsAttention ? "var(--red)" : "var(--violet)";
            return (
              <div
                key={d.id}
                className="card"
                style={{
                  position: "relative",
                  borderTop: `1.5px solid ${accent}`,
                  boxShadow: `0 0 22px -10px ${accent}`,
                  transition: "transform .12s, box-shadow .15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 4px 26px -8px ${accent}`; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = `0 0 22px -10px ${accent}`; }}
              >
              {canManage && (
                <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 6, zIndex: 2 }}>
                  {d.status === "pending" && (
                    <button
                      className="btn btn-green"
                      style={{ padding: "3px 8px" }}
                      title="Approva questa Difesa"
                      onClick={(e) => { e.preventDefault(); approveDef(d); }}
                    >
                      ✓ Approva
                    </button>
                  )}
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
                  {d.monsters.join(" / ")}
                </div>
                {d.desc && <p style={{ color: "var(--text-muted)", fontSize: 12.5, margin: "0 0 10px" }}>{d.desc}</p>}
                <span className="badge badge-approved">{d.counters.filter((c) => c.status === "approved").length} counter</span>{" "}
                {d.status === "pending" && <span className="badge badge-pending">Difesa da approvare</span>}{" "}
                {pendingCounters > 0 && (
                  <span className="badge badge-pending">{pendingCounters} in coda</span>
                )}
              </a>
              </div>
            );
          })}
        </div>
        {hiddenCount > 0 && (
          <div style={{ textAlign: "center", marginTop: 18 }}>
            <button className="btn btn-ghost" onClick={() => setShowAllRest(true)}>
              Mostra altre ({hiddenCount})
            </button>
          </div>
        )}
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
              // Se c'è una nota (stessi 3 mostri, leader diverso da una
              // difesa già esistente) il modale resta aperto per farla
              // leggere — la difesa è già stata creata e aggiunta sopra.
              if (data.note) return { note: data.note };
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
      {confirmUnpinAll && (
        <ConfirmModal
          message={`Togliere il pin a tutte e ${totalPinnedCount} le difese fissate in cima? Restano tutte al loro posto, solo non più in cima.`}
          confirmLabel={unpinningAll ? "..." : "Unpin all"}
          onConfirm={unpinAll}
          onCancel={() => setConfirmUnpinAll(false)}
        />
      )}
    </div>
  );
}
