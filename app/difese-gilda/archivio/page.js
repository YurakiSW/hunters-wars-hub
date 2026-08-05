"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../../../components/Header";
import LoadingScreen from "../../../components/LoadingScreen";
import MonsterCrest from "../../../components/MonsterCrest";
import ConfirmModal from "../../../components/ConfirmModal";
import Sticker from "../../../components/Sticker";
import NicknameHeart from "../../../components/NicknameHeart";

function rateColor(rate) {
  if (rate >= 0.8) return "var(--green)";
  if (rate >= 0.5) return "var(--gold)";
  return "var(--red)";
}

export default function GuildDefenseArchivePage() {
  const [user, setUser] = useState(null);
  const [archives, setArchives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (!d.user) return router.push("/login");
      if (d.user.status !== "approved") return router.push("/pending");
      setUser(d.user);
    });
  }, []);

  function load() {
    setLoading(true);
    fetch("/api/guild-defenses/archive").then((r) => r.json()).then((d) => {
      setArchives(d.archives || []);
      setLoading(false);
    });
  }
  useEffect(load, []);

  async function doDeleteAll() {
    setDeletingAll(true);
    const res = await fetch("/api/guild-defenses/archive/all", { method: "DELETE" });
    setDeletingAll(false);
    setConfirmDeleteAll(false);
    if (res.ok) load();
  }

  if (!user) return <LoadingScreen />;
  const isAdmin = user.role === "admin";

  return (
    <div>
      <Header user={user} />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>📦 Archivio Difese Gilda</h1>
          {isAdmin && archives.length > 0 && (
            <button className="btn btn-ghost" onClick={() => setConfirmDeleteAll(true)}>
              🗑 Svuota tutto l&apos;archivio ({archives.length})
            </button>
          )}
        </div>
        <p style={{ color: "var(--text-faint)", fontSize: 13, marginBottom: 16 }}>
          Stagioni passate, congelate al momento dell&apos;archiviazione — sola lettura, i numeri qui non cambiano più.
        </p>
        <a href="/difese-gilda" style={{ fontSize: 12.5, color: "var(--gold)" }}>← Torna alla stagione corrente</a>

        <div style={{ marginTop: 16 }}>
          {loading ? (
            <div style={{ textAlign: "center", marginTop: 20 }}>
              <Sticker name="totem" size={110} />
              <p style={{ color: "var(--text-faint)", marginTop: 8 }}>Caricamento...</p>
            </div>
          ) : archives.length === 0 ? (
            <p style={{ color: "var(--text-faint)" }}>Nessuna stagione archiviata ancora.</p>
          ) : (
            archives.map((a) => <ArchiveSeasonRow key={a.archiveId} meta={a} isAdmin={isAdmin} onDeleted={load} user={user} />)
          )}
        </div>
      </div>

      {confirmDeleteAll && (
        <ConfirmModal
          message={`Eliminare per sempre TUTTE e ${archives.length} le stagioni archiviate? Non si può annullare.`}
          confirmLabel={deletingAll ? "..." : "Svuota tutto"}
          onConfirm={doDeleteAll}
          onCancel={() => setConfirmDeleteAll(false)}
        />
      )}
    </div>
  );
}

function ArchiveSeasonRow({ meta, isAdmin, onDeleted, user }) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function toggle() {
    if (!open && !full) {
      setLoadingFull(true);
      fetch(`/api/guild-defenses/archive/${meta.archiveId}`).then((r) => r.json()).then((d) => {
        setFull(d.archive || null);
        setLoadingFull(false);
      });
    }
    setOpen((v) => !v);
  }

  async function doDelete() {
    setDeleting(true);
    const res = await fetch(`/api/guild-defenses/archive/${meta.archiveId}`, { method: "DELETE" });
    setDeleting(false);
    setConfirmDelete(false);
    if (res.ok) onDeleted();
  }

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flexWrap: "wrap" }} onClick={toggle}>
        <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{open ? "▼" : "▶"}</span>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--gold)" }}>{meta.label}</div>
          <div className="f-mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>
            {meta.siegeCount} siege · {meta.defenseCount} difese · vs {meta.enemyGuilds?.join(", ") || "—"}
          </div>
        </div>
        {isAdmin && (
          <button
            className="btn btn-ghost" style={{ fontSize: 11 }}
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
          >
            🗑
          </button>
        )}
      </div>
      {open && (
        loadingFull ? (
          <p style={{ color: "var(--text-faint)", fontSize: 12.5, marginTop: 10 }}>Caricamento...</p>
        ) : full ? (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-soft)", display: "flex", flexDirection: "column", gap: 8 }}>
            {full.defenses.map((d) => (
              <div key={d.defenseKey} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg-soft)", borderRadius: 8, padding: "8px 10px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 3 }}>
                  {d.monsterNames.map((n, i) => <MonsterCrest key={i} name={n} size={28} noSplit />)}
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}><NicknameHeart isOwn={user?.nickname && d.ownerNick && user.nickname.trim().toLowerCase() === d.ownerNick.trim().toLowerCase()}>{d.ownerNick}</NicknameHeart></div>
                  <div style={{ fontSize: 10.5, color: "var(--text-faint)" }}>{d.monsterNames.join(" / ")}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: rateColor(d.winRate) }}>{Math.round(d.winRate * 100)}%</div>
                  <div className="f-mono" style={{ fontSize: 10, color: "var(--text-faint)" }}>{d.wins}V · {d.losses}S</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--red)", fontSize: 12.5, marginTop: 10 }}>Errore nel caricare il dettaglio.</p>
        )
      )}
      {confirmDelete && (
        <ConfirmModal
          message={`Eliminare per sempre la stagione "${meta.label}" dall'archivio? Non si può annullare.`}
          confirmLabel={deleting ? "..." : "Elimina"}
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
