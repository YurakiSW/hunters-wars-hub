"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "../../components/Header";
import MonsterCrest from "../../components/MonsterCrest";
import ConfirmModal from "../../components/ConfirmModal";
import Sticker from "../../components/Sticker";
import NicknameHeart from "../../components/NicknameHeart";
import LoadingScreen from "../../components/LoadingScreen";

function rateColor(rate) {
  if (rate >= 0.8) return "var(--green)";
  if (rate >= 0.5) return "var(--gold)";
  return "var(--red)";
}

export default function GuildDefensesPage() {
  return (
    <Suspense fallback={null}>
      <GuildDefensesContent />
    </Suspense>
  );
}

function GuildDefensesContent() {
  const [user, setUser] = useState(null);
  const [ownerQuery, setOwnerQuery] = useState("");
  const [teamQuery, setTeamQuery] = useState("");
  const [mode, setMode] = useState("team"); // "team" | "owner"
  const [defenses, setDefenses] = useState([]); // modalità owner: lista piatta
  const [teams, setTeams] = useState([]); // modalità team: lista raggruppata
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [sieges, setSieges] = useState([]);
  const [siegesLoading, setSiegesLoading] = useState(true);
  const [busySiege, setBusySiege] = useState(null);
  const [confirmDeleteSiege, setConfirmDeleteSiege] = useState(null);
  const [deletingSiege, setDeletingSiege] = useState(false);

  // Guardia contro le richieste "in corsa": se spunti/rispunti in fretta,
  // partono più fetch in sequenza — senza questo controllo una risposta
  // VECCHIA (es. "0 risultati" dell'istante in cui avevi tolto la spunta)
  // può arrivare DOPO quella nuova e restare a schermo per sbaglio, dando
  // l'impressione di un bug ("dice nulla da mostrare" anche se non è vero).
  const loadReqIdRef = useRef(0);
  const siegeReqIdRef = useRef(0);

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (!d.user) return router.push("/login");
      if (d.user.status !== "approved") return router.push("/pending");
      setUser(d.user);
    });
  }, []);

  function loadResults(owner, team) {
    const myReqId = ++loadReqIdRef.current;
    setLoading(true);
    const params = new URLSearchParams();
    if (owner) params.set("owner", owner);
    else if (team) params.set("team", team);
    fetch(`/api/guild-defenses${params.toString() ? `?${params}` : ""}`)
      .then((r) => r.json())
      .then((d) => {
        if (loadReqIdRef.current !== myReqId) return; // risposta vecchia, scartata
        setMode(d.mode || "team");
        if (d.mode === "owner") setDefenses(d.defenses || []);
        else setTeams(d.teams || []);
        setLoading(false);
      });
  }

  function loadSieges() {
    const myReqId = ++siegeReqIdRef.current;
    setSiegesLoading(true);
    fetch("/api/admin/siege-defenses").then((r) => r.json()).then((d) => {
      if (siegeReqIdRef.current !== myReqId) return;
      setSieges(d.sieges || []);
      setSiegesLoading(false);
    });
  }

  useEffect(() => {
    const o = searchParams.get("owner") || "";
    const t = searchParams.get("team") || "";
    setOwnerQuery(o);
    setTeamQuery(t);
    loadResults(o, t);
    loadSieges();
  }, []);

  function updateOwnerQuery(v) {
    setOwnerQuery(v);
    setTeamQuery("");
    const params = new URLSearchParams();
    if (v) params.set("owner", v);
    router.replace(`/difese-gilda${params.toString() ? `?${params}` : ""}`, { scroll: false });
    loadResults(v, "");
  }
  function updateTeamQuery(v) {
    setTeamQuery(v);
    setOwnerQuery("");
    const params = new URLSearchParams();
    if (v) params.set("team", v);
    router.replace(`/difese-gilda${params.toString() ? `?${params}` : ""}`, { scroll: false });
    loadResults("", v);
  }

  async function toggleSiege(siegeKey, included) {
    setBusySiege(siegeKey);
    const res = await fetch("/api/admin/siege-defenses", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_included", siegeKey, included }),
    });
    setBusySiege(null);
    if (res.ok) { loadSieges(); loadResults(ownerQuery, teamQuery); }
  }

  async function doDeleteSiege(siegeKey) {
    setDeletingSiege(true);
    const res = await fetch("/api/admin/siege-defenses", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", siegeKey }),
    });
    setDeletingSiege(false);
    setConfirmDeleteSiege(null);
    if (res.ok) { loadSieges(); loadResults(ownerQuery, teamQuery); }
  }

  if (!user) return <LoadingScreen />;
  // Chiunque sia approvato può scegliere quali siege contano per sé — non
  // cambia dati per gli altri in modo irreversibile, solo la propria vista
  // (il conteggio condiviso, sì, ma è lo stesso principio di "chiunque può
  // proporre un counter": aperto a tutti, solo l'eliminazione resta
  // riservata). Eliminare una siege invece è irreversibile e tocca dati
  // per sempre — quella resta solo Admin.
  const canToggle = true;
  const isAdmin = user.role === "admin";
  const includedCount = sieges.filter((s) => s.included).length;

  return (
    <div>
      <Header user={user} />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px" }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>🛡️ Difese Gilda</h1>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <p style={{ color: "var(--text-faint)", fontSize: 13, marginBottom: 16 }}>
            Vista unificata per team — apri un team per vedere tutti i nostri giocatori che lo usano.
          </p>
          <a href="/difese-gilda/archivio" style={{ fontSize: 12.5, color: "var(--gold)" }}>📦 Archivio stagioni passate →</a>
        </div>

        {!siegesLoading && sieges.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="f-mono" style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 8 }}>
              SIEGE INCLUSE NEL CONTEGGIO ({includedCount}/{sieges.length})
            </div>
            {sieges.map((s) => (
              <div key={s.siegeKey} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", flexWrap: "wrap" }}>
                <input
                  type="checkbox" checked={!!s.included} disabled={busySiege === s.siegeKey}
                  onChange={(e) => toggleSiege(s.siegeKey, e.target.checked)}
                />
                <span style={{ fontSize: 13, flex: 1, minWidth: 160 }}>
                  {s.enemyGuilds?.join(" e ") || "—"}{" "}
                  <span style={{ color: "var(--text-faint)", fontSize: 11.5 }}>
                    — {s.dateFrom ? new Date(s.dateFrom * 1000).toLocaleDateString() : "?"} · {s.battleCount} battaglie
                  </span>
                </span>
                {isAdmin && (
                  <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setConfirmDeleteSiege(s.siegeKey)}>🗑</button>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            value={ownerQuery}
            onChange={(e) => updateOwnerQuery(e.target.value)}
            placeholder="Cerca per nick proprietario..."
            style={{ flex: 1, minWidth: 200 }}
          />
          <input
            value={teamQuery}
            onChange={(e) => updateTeamQuery(e.target.value)}
            placeholder="Cerca per mostro (team)..."
            style={{ flex: 1, minWidth: 200 }}
          />
        </div>

        {loading ? (
          <div style={{ textAlign: "center", marginTop: 30 }}>
            <Sticker name="totem" size={170} />
            <p style={{ color: "var(--text-faint)", marginTop: 8 }}>Caricamento...</p>
          </div>
        ) : includedCount === 0 ? (
          <p style={{ color: "var(--text-faint)" }}>Nessuna siege inclusa nel conteggio — includine almeno una qui sopra.</p>
        ) : mode === "owner" ? (
          defenses.length === 0 ? (
            <div style={{ textAlign: "center", marginTop: 20, color: "var(--text-faint)" }}>
              <Sticker name="depresso" revealOnClick="emozionato" size={190} />
              <p>Nessuna difesa trovata per questo nick.</p>
            </div>
          ) : (
            defenses.map((d) => <DefenseRow key={d.defenseKey} summary={d} user={user} />)
          )
        ) : teams.length === 0 ? (
          <div style={{ textAlign: "center", marginTop: 20, color: "var(--text-faint)" }}>
            <Sticker name="depresso" revealOnClick="emozionato" size={190} />
            <p>{teamQuery ? "Nessun team trovato con questo mostro." : "Nessuna difesa da mostrare."}</p>
          </div>
        ) : (
          teams.map((t, i) => <TeamRow key={t.teamKey} summary={t} isTop={i === 0 && !teamQuery} user={user} />)
        )}
      </div>

      {confirmDeleteSiege && (
        <ConfirmModal
          message="Eliminare questa siege? Le sue battaglie di difesa spariscono dalle statistiche — non si può annullare."
          confirmLabel={deletingSiege ? "..." : "Elimina"}
          onConfirm={() => doDeleteSiege(confirmDeleteSiege)}
          onCancel={() => setConfirmDeleteSiege(null)}
        />
      )}
    </div>
  );
}

// Riga di una singola difesa (modalità ricerca per proprietario): un
// giocatore, un team, espandibile per vedere lo stamp per gilda nemica.
function DefenseRow({ summary, user }) {
  const isOwn = user?.nickname && summary.ownerNick && user.nickname.trim().toLowerCase() === summary.ownerNick.trim().toLowerCase();
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
          <div style={{ fontSize: 14.5, fontWeight: 600 }}><NicknameHeart isOwn={isOwn}>{summary.ownerNick}</NicknameHeart></div>
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

// Riga di un TEAM (vista di default e ricerca per mostro): la terna di
// mostri, sommata su tutti i nostri giocatori che la usano — espandibile
// per vedere ogni giocatore con le proprie vittorie/sconfitte.
function TeamRow({ summary, isTop, user }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  function toggle() {
    if (!open && !detail) {
      setLoadingDetail(true);
      fetch(`/api/guild-defenses/team/${encodeURIComponent(summary.teamKey)}`)
        .then((r) => r.json())
        .then((d) => { setDetail(d.detail || null); setLoadingDetail(false); });
    }
    setOpen((v) => !v);
  }

  return (
    <div className="card" style={{ marginBottom: 10, borderColor: isTop ? "var(--gold)" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flexWrap: "wrap" }} onClick={toggle}>
        <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{open ? "▼" : "▶"}</span>
        {isTop && <Sticker name="re" size={56} alt="La squadra col winrate più alto" />}
        <div style={{ display: "flex", gap: 4 }}>
          {summary.monsterNames.map((n, i) => <MonsterCrest key={i} name={n} size={34} />)}
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{summary.monsterNames.join(" / ")}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
            usato da {summary.playerCount} {summary.playerCount === 1 ? "giocatore" : "giocatori"}
          </div>
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
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-soft)", display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="f-mono" style={{ fontSize: 10.5, color: "var(--text-faint)", marginBottom: 2 }}>
              I NOSTRI GIOCATORI
            </div>
            {detail.players.map((p) => (
              <PlayerSubRow key={p.defenseKey} player={p} user={user} />
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--red)", fontSize: 12.5, marginTop: 10 }}>Errore nel caricare il dettaglio.</p>
        )
      )}
    </div>
  );
}

// Un giocatore dentro un team aperto — espandibile una seconda volta per lo
// stamp per gilda nemica di QUELLO specifico giocatore.
function PlayerSubRow({ player, user }) {
  const isOwn = user?.nickname && player.ownerNick && user.nickname.trim().toLowerCase() === player.ownerNick.trim().toLowerCase();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: "var(--bg-soft)", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setOpen((v) => !v)}>
        <span style={{ fontSize: 10, color: "var(--text-faint)" }}>{open ? "▼" : "▶"}</span>
        <span style={{ fontSize: 13, flex: 1 }}><NicknameHeart isOwn={isOwn}>{player.ownerNick}</NicknameHeart></span>
        <span className="f-mono" style={{ fontSize: 12, fontWeight: 600, color: rateColor(player.winRate) }}>
          {player.wins}V — {player.losses}S ({Math.round(player.winRate * 100)}%)
        </span>
      </div>
      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {player.enemyGuilds.map((g) => {
            const total = g.wins + g.losses;
            const rate = total ? g.wins / total : 0;
            return (
              <div key={g.guild} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, padding: "2px 4px" }}>
                <span style={{ color: "var(--text-faint)" }}>{g.guild}</span>
                <span className="f-mono" style={{ color: rateColor(rate) }}>{g.wins}V — {g.losses}S</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
