"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../../../components/Header";
import MonsterCrest from "../../../components/MonsterCrest";
import NicknameHeart from "../../../components/NicknameHeart";
import LoadingScreen from "../../../components/LoadingScreen";
import Sticker from "../../../components/Sticker";

// Pagina A SÉ STANTE, deliberatamente isolata da /difese-gilda (27/09/2026,
// Flora): quella pagina principale ha un pulsante che non risponde al
// click su schermo, causa non ancora confermata con certezza — creare
// "Best Def Rate" come rotta indipendente, con la propria pagina, il
// proprio fetch e i propri componenti (duplicati qui apposta, non
// importati dall'altra pagina) elimina qualunque dipendenza da quello
// stato/quel bug, qualunque esso sia. Nessuna modifica al file esistente:
// zero rischio di romperlo ulteriormente.
function rateColor(rate) {
  if (rate >= 0.8) return "var(--green)";
  if (rate >= 0.5) return "var(--gold)";
  return "var(--red)";
}

export default function BestDefRatePage() {
  const [user, setUser] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (!d.user) return router.push("/login");
      if (d.user.status !== "approved") return router.push("/pending");
      setUser(d.user);
    });
  }, []);

  // Sempre "tutta la stagione", MAI legata alle spunte incluse/escluse di
  // Difese Gilda: era la richiesta originale ("non come selezione siege di
  // adesso, deve tenere conto di tutte le siege che carico"). Non è
  // un'opzione da attivare — è l'unico comportamento di questa pagina
  // (27/09/2026, Flora — prima girava di default con `allSieges: false`,
  // mostrando "nessun dato" ogni volta che le spunte erano vuote).
  useEffect(() => {
    setLoading(true);
    fetch("/api/guild-defenses?bestPerPlayer=1&allSieges=1")
      .then((r) => r.json())
      .then((d) => {
        setRows(d.defenses || []);
        setLoading(false);
      });
  }, []);

  if (!user) return <LoadingScreen />;

  return (
    <div>
      <Header user={user} />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>🏆 Best Def Rate</h1>
          <a href="/difese-gilda" style={{ fontSize: 12.5, color: "var(--gold)" }}>← Torna a Difese Gilda</a>
        </div>
        <p style={{ color: "var(--text-faint)", fontSize: 13, marginBottom: 16 }}>
          Per ogni giocatore, la difesa con il winrate più alto tra quelle schierate — su tutte le siege mai caricate, a prescindere dalle spunte incluse/escluse in Difese Gilda.
        </p>

        {loading ? (
          <div style={{ textAlign: "center", marginTop: 30 }}>
            <Sticker name="totem" size={170} />
            <p style={{ color: "var(--text-faint)", marginTop: 8 }}>Caricamento...</p>
          </div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: "center", marginTop: 20, color: "var(--text-faint)" }}>
            <Sticker name="depresso" revealOnClick="emozionato" size={190} />
            <p>Nessun dato ancora — carica un log di Siege con qualche battaglia di difesa (sezione Difese Gilda).</p>
          </div>
        ) : (
          rows.map((d) => <Row key={d.defenseKey} summary={d} user={user} />)
        )}
      </div>
    </div>
  );
}

// Copia diretta di DefenseRow da app/difese-gilda/page.js — duplicata di
// proposito (vedi nota in cima al file), non importata.
function Row({ summary, user }) {
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
