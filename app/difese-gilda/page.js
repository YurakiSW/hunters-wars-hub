"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "../../components/Header";
import MonsterCrest from "../../components/MonsterCrest";

export default function GuildDefensesPage() {
  return (
    <Suspense fallback={null}>
      <GuildDefensesContent />
    </Suspense>
  );
}

function GuildDefensesContent() {
  const [user, setUser] = useState(null);
  const [defenses, setDefenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sieges, setSieges] = useState([]);
  const [siegesLoading, setSiegesLoading] = useState(true);
  const [busySiege, setBusySiege] = useState(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (!d.user) return router.push("/login");
      if (d.user.status !== "approved") return router.push("/pending");
      setUser(d.user);
    });
  }, []);

  function loadDefenses(q) {
    setLoading(true);
    fetch(`/api/guild-defenses${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      .then((r) => r.json())
      .then((d) => { setDefenses(d.defenses || []); setLoading(false); });
  }
  function loadSieges() {
    setSiegesLoading(true);
    fetch("/api/admin/siege-defenses").then((r) => r.json()).then((d) => {
      setSieges(d.sieges || []);
      setSiegesLoading(false);
    });
  }
  useEffect(() => { loadDefenses(query); loadSieges(); }, []);

  function updateQuery(v) {
    setQuery(v);
    const params = new URLSearchParams(searchParams.toString());
    if (v) params.set("q", v); else params.delete("q");
    router.replace(`/difese-gilda${params.toString() ? `?${params}` : ""}`, { scroll: false });
    loadDefenses(v);
  }

  async function toggleSiege(siegeKey, included) {
    setBusySiege(siegeKey);
    const res = await fetch("/api/admin/siege-defenses", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_included", siegeKey, included }),
    });
    setBusySiege(null);
    if (res.ok) { loadSieges(); loadDefenses(query); }
  }

  if (!user) return null;
  const canToggle = user.role === "admin" || user.role === "reviewer";
  const includedCount = sieges.filter((s) => s.included).length;

  return (
    <div>
      <Header user={user} />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px" }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>🛡️ Difese Gilda</h1>
        <p style={{ color: "var(--text-faint)", fontSize: 13, marginBottom: 16 }}>
          Come rendono le vostre difese contro chi vi attacca. Cerca il tuo nick per vedere solo le tue.
        </p>

        {!siegesLoading && sieges.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="f-mono" style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 8 }}>
              SIEGE INCLUSE NEL CONTEGGIO ({includedCount}/{sieges.length})
            </div>
            {sieges.map((s) => (
              <div key={s.siegeKey} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                <input
                  type="checkbox" checked={!!s.included} disabled={!canToggle || busySiege === s.siegeKey}
                  onChange={(e) => toggleSiege(s.siegeKey, e.target.checked)}
                />
                <span style={{ fontSize: 13, flex: 1 }}>
                  {s.enemyGuilds?.join(" e ") || "—"}{" "}
                  <span style={{ color: "var(--text-faint)", fontSize: 11.5 }}>
                    — {s.dateFrom ? new Date(s.dateFrom * 1000).toLocaleDateString() : "?"} · {s.battleCount} battaglie
                  </span>
                </span>
              </div>
            ))}
            {!canToggle && (
              <p style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 6 }}>
                Solo Admin e Revisori possono cambiare quali siege sono incluse.
              </p>
            )}
          </div>
        )}

        <input
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          placeholder="Cerca per nick proprietario..."
          style={{ width: "100%", marginBottom: 16 }}
        />
        {loading ? (
          <p style={{ color: "var(--text-faint)" }}>Caricamento...</p>
        ) : defenses.length === 0 ? (
          <p style={{ color: "var(--text-faint)" }}>
            {includedCount === 0
              ? "Nessuna siege inclusa nel conteggio — includine almeno una in Diagnostica o qui sopra."
              : query ? "Nessuna difesa trovata per questo nick." : "Nessuna difesa da mostrare."}
          </p>
        ) : (
          defenses.map((d) => <DefenseRow key={d.defenseKey} summary={d} />)
        )}
      </div>
    </div>
  );
}

function rateColor(rate) {
  if (rate >= 0.8) return "var(--green)";
  if (rate >= 0.5) return "var(--gold)";
  return "var(--red)";
}

function DefenseRow({ summary }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  function toggle() {
    if (!open && !detail) {
      setLoadingDetail(true);
      fetch(`/api/guild-defenses/${encodeURIComponent(summary.defenseKey)}`)
        .then((r) => r.json())
        .then((d) => { setDetail(d.detail || null); setLoadingDetail(false); });
    }
    setOpen((v) => !v);
  }

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flexWrap: "wrap" }} onClick={toggle}>
        <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{open ? "▼" : "▶"}</span>
        <div style={{ display: "flex", gap: 4 }}>
          {summary.monsterNames.map((n, i) => <MonsterCrest key={i} name={n} size={34} />)}
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{summary.ownerNick}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{summary.monsterNames.join(" / ")}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: rateColor(summary.winRate) }}>
            {Math.round(summary.winRate * 100)}%
          </div>
          <div className="f-mono" style={{ fontSize: 10.5, color: "var(--text-faint)" }}>
            {summary.wins} vittorie · {summary.losses} sconfitte
          </div>
        </div>
      </div>
      {open && (
        loadingDetail ? (
          <p style={{ color: "var(--text-faint)", fontSize: 12.5, marginTop: 10 }}>Caricamento...</p>
        ) : detail ? (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-soft)" }}>
            <div className="f-mono" style={{ fontSize: 10.5, color: "var(--text-faint)", marginBottom: 6 }}>
              PER GILDA NEMICA
            </div>
            {detail.enemyGuilds.map((g) => {
              const total = g.wins + g.losses;
              const rate = total ? g.wins / total : 0;
              return (
                <div key={g.guild} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-soft)", borderRadius: 6, padding: "7px 10px", marginBottom: 5, fontSize: 12.5 }}>
                  <span style={{ color: "var(--text-muted)" }}>{g.guild}</span>
                  <span className="f-mono" style={{ color: rateColor(rate), fontWeight: 600 }}>
                    {g.wins} vittorie — {g.losses} sconfitte ({Math.round(rate * 100)}%)
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ color: "var(--red)", fontSize: 12.5, marginTop: 10 }}>Errore nel caricare il dettaglio.</p>
        )
      )}
    </div>
  );
}
