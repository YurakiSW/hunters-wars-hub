"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../../../components/Header";
import MonsterCrest from "../../../components/MonsterCrest";
import NicknameHeart from "../../../components/NicknameHeart";
import LoadingScreen from "../../../components/LoadingScreen";
import Sticker from "../../../components/Sticker";

// Pagina A SÉ STANTE, isolata da /difese-gilda (27/09/2026, Flora): classifica
// dei giocatori per winrate in difesa, sempre su TUTTE le siege caricate, a
// prescindere dalle spunte incluse/escluse di Difese Gilda. I dati arrivano da
// /api/guild-defenses?bestPerPlayer=1&allSieges=1 (lib/guildDefenses.js) e si
// aggiornano da soli a ogni log importato dal pulsante delle difese.

function rateColor(rate) {
  if (rate >= 0.8) return "var(--green)";
  if (rate >= 0.5) return "var(--gold)";
  return "var(--red)";
}

// Data identica su server e browser (UTC, scritta a mano): toLocaleDateString
// dipende da lingua e fuso di chi la esegue e causava errori di idratazione.
const due = (n) => String(n).padStart(2, "0");
function dataIt(seconds) {
  if (!seconds) return "?";
  const d = new Date(seconds * 1000);
  return `${due(d.getUTCDate())}/${due(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export default function BestDefRatePage() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null); // { players, lowData, guildAvg, minBattles }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (!d.user) return router.push("/login");
      if (d.user.status !== "approved") return router.push("/pending");
      setUser(d.user);
    });
  }, []);

  // Sempre "tutta la stagione", MAI legata alle spunte incluse/escluse: era la
  // richiesta originale. Con tetto di attesa: se il server non risponde entro
  // 55s si mostra un errore vero invece di "Caricamento..." per sempre.
  useEffect(() => {
    setLoading(true);
    setError("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);
    fetch("/api/guild-defenses?bestPerPlayer=1&allSieges=1", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`Il server ha risposto ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setData({ players: d.players || [], lowData: d.lowData || [], guildAvg: d.guildAvg || null, minBattles: d.minBattles || 10 });
        setLoading(false);
      })
      .catch((e) => {
        setError(e.name === "AbortError" ? "Il server ci sta mettendo troppo (oltre 55 secondi)." : e.message);
        setLoading(false);
      })
      .finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, []);

  if (!user) return <LoadingScreen />;

  const avgRate = data?.guildAvg?.winRate ?? 0;
  const vuoto = data && data.players.length === 0 && data.lowData.length === 0;

  return (
    <div>
      <Header user={user} />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>🏆 Best Def Rate</h1>
          <a href="/difese-gilda" style={{ fontSize: 12.5, color: "var(--gold)" }}>← Torna a Difese Gilda</a>
        </div>
        <p style={{ color: "var(--text-faint)", fontSize: 13, marginBottom: 12 }}>
          Giocatori dal più forte al più debole in difesa, su tutte le siege mai caricate (a prescindere dalle spunte
          incluse/escluse in Difese Gilda). Apri un giocatore per vedere ogni sua squadra e come è andato siege per siege.
        </p>

        {loading ? (
          <div style={{ textAlign: "center", marginTop: 30 }}>
            <Sticker name="totem" size={170} />
            <p style={{ color: "var(--text-faint)", marginTop: 8 }}>Caricamento...</p>
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <p style={{ color: "var(--red)" }}>Non sono riuscito a caricare i dati: {error}</p>
            <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => window.location.reload()}>Riprova</button>
          </div>
        ) : vuoto ? (
          <div style={{ textAlign: "center", marginTop: 20, color: "var(--text-faint)" }}>
            <Sticker name="depresso" revealOnClick="emozionato" size={190} />
            <p>Nessun dato ancora — carica un log di Siege con qualche battaglia di difesa (sezione Difese Gilda).</p>
          </div>
        ) : (
          <>
            {data.guildAvg && (
              <div style={{ background: "var(--bg-soft)", border: "1px solid var(--border-soft)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, fontSize: 13 }}>
                <span>
                  Media della gilda in difesa:{" "}
                  <strong style={{ color: rateColor(avgRate) }}>{Math.round(avgRate * 100)}%</strong>
                </span>
                <span className="f-mono" style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                  {data.guildAvg.wins} vittorie · {data.guildAvg.losses} sconfitte · {data.guildAvg.playerCount} giocatori
                </span>
              </div>
            )}

            {data.players.map((pl) => <PlayerRow key={pl.ownerNick} player={pl} user={user} avgRate={avgRate} />)}

            {data.lowData.length > 0 && (
              <>
                <div className="f-mono" style={{ fontSize: 11, color: "var(--text-faint)", margin: "22px 0 8px" }}>
                  POCHI DATI — MENO DI {data.minBattles} BATTAGLIE, NON IN CLASSIFICA
                </div>
                {data.lowData.map((pl) => <PlayerRow key={pl.ownerNick} player={pl} user={user} avgRate={avgRate} lowData />)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Una riga per GIOCATORE: winrate complessivo in difesa e distanza dalla media
// della gilda; nella tendina, ogni squadra col suo winrate (evidenziata quella
// che gli costa più sconfitte) e l'andamento siege per siege. Tutti i dati
// arrivano già con la lista: nessuna richiesta di dettaglio.
function PlayerRow({ player, user, avgRate, lowData }) {
  const isOwn = user?.nickname && user.nickname.trim().toLowerCase() === player.ownerNick.trim().toLowerCase();
  const [open, setOpen] = useState(false);
  // differenza tra i due numeri come li vedi scritti, così la sottrazione torna a occhio
  const delta = Math.round(player.winRate * 100) - Math.round(avgRate * 100);
  const deltaColor = delta > 0 ? "var(--green)" : delta < 0 ? "var(--red)" : "var(--text-faint)";

  return (
    <div className="card" style={{ marginBottom: 10, opacity: lowData ? 0.75 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flexWrap: "wrap" }} onClick={() => setOpen((v) => !v)}>
        <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{open ? "▼" : "▶"}</span>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 15.5, fontWeight: 600 }}><NicknameHeart isOwn={isOwn}>{player.ownerNick}</NicknameHeart></div>
          <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
            {player.defenses.length} {player.defenses.length === 1 ? "squadra" : "squadre"} · {player.total} battaglie
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: rateColor(player.winRate) }}>
            {Math.round(player.winRate * 100)}% win in difesa
          </div>
          {!lowData && (
            <div style={{ fontSize: 11.5, fontWeight: 600, color: deltaColor }}>
              {delta > 0 ? "+" : ""}{delta} punti sulla media
            </div>
          )}
        </div>
      </div>
      {/* I tre numeri richiesti espliciti, non solo dentro il testo:
          attacchi subiti (totale), difese win, difese loose — la
          percentuale sopra è calcolata proprio da questi tre
          (28/09/2026, Flora). */}
      <div style={{ display: "flex", gap: 18, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-soft)", flexWrap: "wrap" }}>
        <span className="f-mono" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
          Attacchi subiti: <strong style={{ color: "var(--text)" }}>{player.total}</strong>
        </span>
        <span className="f-mono" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
          Difese win: <strong style={{ color: "var(--green)" }}>{player.wins}</strong>
        </span>
        <span className="f-mono" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
          Difese loose: <strong style={{ color: "var(--red)" }}>{player.losses}</strong>
        </span>
      </div>

      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-soft)" }}>
          <div className="f-mono" style={{ fontSize: 10.5, color: "var(--text-faint)", marginBottom: 6 }}>SQUADRE IN DIFESA</div>
          {player.defenses.map((d) => (
            <div
              key={d.defenseKey}
              style={{
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                background: "var(--bg-soft)", borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                borderLeft: d.costliest ? "3px solid var(--red)" : "3px solid transparent",
              }}
            >
              <div style={{ display: "flex", gap: 4 }}>
                {d.monsterNames.map((n, i) => <MonsterCrest key={i} name={n} size={30} />)}
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{d.monsterNames.join(" / ")}</div>
                {d.costliest && (
                  <div style={{ fontSize: 11, color: "var(--red)", marginTop: 2 }}>
                    ⚠ È la squadra che ti costa più sconfitte ({d.losses})
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: rateColor(d.winRate) }}>{Math.round(d.winRate * 100)}%</div>
                <div className="f-mono" style={{ fontSize: 10.5, color: "var(--text-faint)" }}>{d.wins} vittorie · {d.losses} sconfitte</div>
              </div>
            </div>
          ))}

          <div className="f-mono" style={{ fontSize: 10.5, color: "var(--text-faint)", margin: "14px 0 6px" }}>
            ANDAMENTO PER SIEGE — DALLA PIÙ RECENTE
          </div>
          {player.sieges.map((sg) => (
            <div key={sg.siegeKey} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", background: "var(--bg-soft)", borderRadius: 6, padding: "7px 10px", marginBottom: 5, fontSize: 12.5 }}>
              <span>
                <span className="f-mono" style={{ color: "var(--text-faint)" }}>{dataIt(sg.dateFrom)}</span>{" "}
                <span style={{ color: "var(--text-muted)" }}>{sg.enemyGuilds.length ? sg.enemyGuilds.join(" e ") : "siege"}</span>
              </span>
              <span className="f-mono" style={{ color: rateColor(sg.winRate), fontWeight: 600 }}>
                {Math.round(sg.winRate * 100)}% · {sg.wins} vittorie — {sg.losses} sconfitte
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
