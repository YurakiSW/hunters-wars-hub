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

  function load(q) {
    setLoading(true);
    fetch(`/api/guild-defenses${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      .then((r) => r.json())
      .then((d) => { setDefenses(d.defenses || []); setLoading(false); });
  }
  useEffect(() => { load(query); }, []);

  function updateQuery(v) {
    setQuery(v);
    const params = new URLSearchParams(searchParams.toString());
    if (v) params.set("q", v); else params.delete("q");
    router.replace(`/difese-gilda${params.toString() ? `?${params}` : ""}`, { scroll: false });
    load(v);
  }

  if (!user) return null;

  return (
    <div>
      <Header user={user} />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px" }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>🛡️ Difese Gilda</h1>
        <p style={{ color: "var(--text-faint)", fontSize: 13, marginBottom: 16 }}>
          Come rendono le vostre difese contro chi vi attacca — dai log importati dagli Admin. Cerca il tuo nick per
          vedere solo le tue.
        </p>
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
            {query ? "Nessuna difesa trovata per questo nick." : "Nessun log Difese Gilda importato ancora."}
          </p>
        ) : (
          defenses.map((d) => <DefenseRow key={d.defenseKey} summary={d} />)
        )}
      </div>
    </div>
  );
}

function holdColor(rate) {
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
          {summary.monsterNames.map((n) => <MonsterCrest key={n} name={n} size={34} lead={n === summary.leaderName} />)}
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{summary.ownerNick}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{summary.monsterNames.join(" / ")}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: holdColor(summary.holdRate) }}>
            {Math.round(summary.holdRate * 100)}%
          </div>
          <div className="f-mono" style={{ fontSize: 10.5, color: "var(--text-faint)" }}>
            {summary.held} tenute · {summary.broken} rotte
          </div>
        </div>
      </div>
      {open && (
        loadingDetail ? (
          <p style={{ color: "var(--text-faint)", fontSize: 12.5, marginTop: 10 }}>Caricamento...</p>
        ) : detail ? (
          <DefenseDetail detail={detail} />
        ) : (
          <p style={{ color: "var(--red)", fontSize: 12.5, marginTop: 10 }}>Errore nel caricare il dettaglio.</p>
        )
      )}
    </div>
  );
}

function DefenseDetail({ detail }) {
  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border-soft)" }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        {detail.ourUnits.map((u) => <UnitBuildCard key={u.name} unit={u} />)}
      </div>

      <div className="f-mono" style={{ fontSize: 10.5, color: "var(--text-faint)", marginBottom: 6 }}>
        RECORD PER GILDA NEMICA
      </div>
      {detail.enemyGuilds.map((g) => (
        <EnemyGuildBlock key={g.guild} guildBlock={g} />
      ))}
    </div>
  );
}

// Scheda build di un difensore: rune, artefatti, relic, Combat Stats — stesso
// contenuto informativo mostrato per i Counter, in versione compatta.
function UnitBuildCard({ unit: u }) {
  return (
    <div style={{ flex: "1 1 220px", minWidth: 220, background: "var(--bg-soft)", borderRadius: 8, padding: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <MonsterCrest name={u.name} size={28} lead={u.lead} />
        <strong style={{ fontSize: 13 }}>{u.name}</strong>
      </div>
      {u.runes && <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Rune: <strong>{u.runes}</strong></div>}
      {u.stats && <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Stat: {u.stats}</div>}
      {u.relicMainStat && <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Relic: {u.relicMainStat}</div>}
      {u.combatStats && (
        <div className="f-mono" style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 4, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px 8px" }}>
          <span>HP {u.combatStats.hp ?? "—"}</span><span>ATK {u.combatStats.atk ?? "—"}</span>
          <span>DEF {u.combatStats.def ?? "—"}</span><span>SPD {u.combatStats.spd ?? "—"}</span>
          <span>CRI {u.combatStats.critRate ?? "—"}%</span><span>CDmg {u.combatStats.critDmg ?? "—"}%</span>
          <span>RES {u.combatStats.resistance ?? "—"}%</span><span>ACC {u.combatStats.accuracy ?? "—"}%</span>
        </div>
      )}
    </div>
  );
}

function EnemyGuildBlock({ guildBlock: g }) {
  const [open, setOpen] = useState(false);
  const total = g.held + g.broken;
  const rate = total ? g.held / total : 0;
  return (
    <div style={{ marginBottom: 6 }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "6px 8px", background: "var(--bg-soft)", borderRadius: 6 }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{open ? "▼" : "▶"}</span>
        <span style={{ fontSize: 13, flex: 1 }}>{g.guild}</span>
        <span className="f-mono" style={{ fontSize: 11.5, color: holdColor(rate) }}>
          {g.held} tenute — {g.broken} rotte ({Math.round(rate * 100)}%)
        </span>
      </div>
      {open && (
        <div style={{ paddingLeft: 20, marginTop: 4 }}>
          {g.players.map((p) => <EnemyPlayerBlock key={p.wizardName} player={p} />)}
        </div>
      )}
    </div>
  );
}

function EnemyPlayerBlock({ player: p }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "4px 6px" }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ fontSize: 10.5, color: "var(--text-faint)" }}>{open ? "▼" : "▶"}</span>
        <span style={{ fontSize: 12.5, flex: 1 }}>{p.wizardName}</span>
        <span className="f-mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>
          {p.held} tenute — {p.broken} rotte
        </span>
      </div>
      {open && p.attempts.map((a, i) => (
        <div key={i} style={{ marginLeft: 18, marginBottom: 8, padding: 8, background: "var(--bg-soft)", borderRadius: 6 }}>
          <div style={{ fontSize: 11, marginBottom: 4 }}>
            <span style={{ color: a.held ? "var(--green)" : "var(--red)", fontWeight: 700 }}>{a.held ? "TENUTA" : "ROTTA"}</span>
            {a.timestamp && <span style={{ color: "var(--text-faint)" }}> · {new Date(a.timestamp * 1000).toLocaleDateString()}</span>}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {a.units.map((u) => <UnitBuildCard key={u.name} unit={u} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
