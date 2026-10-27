"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../../components/Header";
import LoadingScreen from "../../components/LoadingScreen";

// Previsione di fine stagione della classifica siege (27/10/2026, Flora).
// Solo Admin e Siege Leader. I dati li manda da solo il plugin SWEX quando in
// gioco si apre la classifica siege; i calcoli stanno in lib/siegeForecast.js.

const due = (n) => String(n).padStart(2, "0");
function fmt(t) {
  if (!t) return "?";
  const d = new Date(t * 1000);
  return `${due(d.getDate())}/${due(d.getMonth() + 1)} ${due(d.getHours())}:${due(d.getMinutes())}`;
}
function fmtDay(t) {
  if (!t) return "?";
  const d = new Date(t * 1000);
  return `${due(d.getDate())}/${due(d.getMonth() + 1)}`;
}
const pctText = (p) => (p >= 0.995 ? "≈100%" : p <= 0.005 ? "≈0%" : `${Math.round(p * 100)}%`);
const probColor = (p) => (p >= 0.8 ? "var(--green)" : p >= 0.2 ? "var(--gold)" : "var(--red)");
const sign = (n) => (n > 0 ? `+${n}` : String(n));
const rankRange = (r) => (r.p10 === r.p90 ? `${r.p50}°` : `${r.p50}° (${r.p10}°–${r.p90}°)`);

// Ricerca che ignora maiuscole, accenti e lettere "stilizzate" (es. ᴍɪꜱꜰɪᴛꜱ = misfits).
const SMALL_CAPS = { "ᴀ": "a", "ʙ": "b", "ᴄ": "c", "ᴅ": "d", "ᴇ": "e", "ꜰ": "f", "ɢ": "g", "ʜ": "h", "ɪ": "i", "ᴊ": "j", "ᴋ": "k", "ʟ": "l", "ᴍ": "m", "ɴ": "n", "ᴏ": "o", "ᴘ": "p", "ʀ": "r", "ꜱ": "s", "ᴛ": "t", "ᴜ": "u", "ᴠ": "v", "ᴡ": "w", "ʏ": "y", "ᴢ": "z" };
const fold = (str) => String(str).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘʀꜱᴛᴜᴠᴡʏᴢ]/g, (c) => SMALL_CAPS[c]).toLowerCase();

export default function PrevisioneSiegePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [cutoff, setCutoff] = useState(32);
  const [filter, setFilter] = useState("all"); // all | safe | needs | out
  const [query, setQuery] = useState("");
  const [sieges, setSieges] = useState(""); // "" = automatico
  const [state, setState] = useState({ loading: true, error: null, empty: false, forecast: null });
  const [showAll, setShowAll] = useState(false);
  const [showOpp, setShowOpp] = useState(false);
  const reqRef = useRef(0);

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (!d.user) return router.push("/login");
      if (d.user.status !== "approved") return router.push("/pending");
      if (d.user.role !== "admin" && d.user.role !== "siege_leader") return router.push("/defs");
      setUser(d.user);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const myReq = ++reqRef.current;
    setState((s) => ({ ...s, loading: true }));
    const params = new URLSearchParams({ n: String(cutoff) });
    if (sieges !== "") params.set("sieges", sieges);
    fetch(`/api/siege-forecast?${params}`).then((r) => r.json()).then((d) => {
      if (reqRef.current !== myReq) return; // risposta vecchia
      if (d.error) setState({ loading: false, error: d.error, empty: false, forecast: null });
      else if (d.empty) setState({ loading: false, error: null, empty: true, forecast: null });
      else setState({ loading: false, error: null, empty: false, forecast: d.forecast });
    }).catch(() => {
      if (reqRef.current === myReq) setState({ loading: false, error: "Errore di rete.", empty: false, forecast: null });
    });
  }, [user, cutoff, sieges]);

  if (!user) return <LoadingScreen />;
  const f = state.forecast;

  return (
    <div>
      <Header user={user} />
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "20px 20px 60px" }}>
        <h2 className="f-hero" style={{ color: "var(--gold)", fontSize: 22, margin: "0 0 4px" }}>Previsione Siege</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 16px" }}>
          Cosa serve a ogni gilda per entrare nel torneo (prime 32) e quanto è probabile che ci riesca. È una stima: i dati li salva da solo il plugin quando apri la classifica siege in gioco.
        </p>

        {state.error && <Box color="var(--red)">{state.error}</Box>}
        {state.empty && (
          <Box>
            Nessuna classifica ancora salvata. Installa il plugin aggiornato in SWEX e, in gioco, apri la <b>classifica siege</b> e la schermata siege:
            il plugin manda tutto qui da solo.
          </Box>
        )}

        {f && f.season && f.season.end && Date.now() / 1000 > f.season.end && (
          <Box>
            La stagione {f.season.seasonNumber} è finita. Appena apri la classifica siege in gioco con la stagione nuova, questa viene archiviata da sola
            (la trovi qui sotto in "Stagioni concluse") e la previsione riparte da zero.
          </Box>
        )}

        {f && (
          <>
            {/* Controlli */}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
              <label style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>
                Prime
                <select value={cutoff} onChange={(e) => setCutoff(Number(e.target.value))} style={{ width: 90 }}>
                  {[32, 35, 50, 60, 100].map((n) => <option key={n} value={n}>{n}{n === 32 ? " (torneo)" : ""}</option>)}
                </select>
                gilde
              </label>
              <label style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>
                Siege rimanenti
                <select value={sieges} onChange={(e) => setSieges(e.target.value)} style={{ width: 150 }}>
                  <option value="">Automatico ({f.sieges.auto})</option>
                  {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              {state.loading && <span style={{ fontSize: 12, color: "var(--text-faint)" }}>calcolo…</span>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 14 }}>
              <Card label={`Soglia per le prime ${f.cutoff}`} value={f.target} sub={`stima: punteggio con cui chiude il ${f.cutoff}° posto`} color="var(--gold)" />
              <Card label={`${f.cutoff}° posto oggi`} value={f.nthNow ? f.nthNow.score : "?"} sub={f.nthNow ? f.nthNow.name : ""} />
              <Card label="Siege rimanenti" value={f.sieges.simulated} sub={f.stale ? "compresa quella non ancora in lista" : "da giocare"} />
              <Card label="Stagione" value={f.season?.seasonNumber ?? "?"} sub={f.season ? `finisce il ${fmtDay(f.season.end)}` : "date non note"} />
            </div>

            <div className="f-mono" style={{ fontSize: 11.5, color: "var(--text-faint)", lineHeight: 1.7, marginBottom: 14 }}>
              Classifica del {fmt(f.snapshotAt)} ({f.visibleCount} gilde visibili)
              {f.season ? <> · Stagione {f.season.seasonNumber ?? "?"}, fine {fmt(f.season.end)}</> : <> · <span style={{ color: "var(--red)" }}>fine stagione non nota: apri la schermata siege in gioco</span></>}
              {" "}· Siege da giocare: {f.sieges.used}{f.sieges.dates.length && sieges === "" ? ` (${f.sieges.dates.map(fmtDay).join(", ")})` : ""}
              {f.stale && <><br />La lista del gioco è indietro di una siege (si aggiorna dopo mezzanotte): ne ho tenuto conto
                {f.pending ? ` — per noi ${sign(f.pending.delta)} già incluso.` : "."}</>}
            </div>

            {/* La nostra gilda */}
            {f.ours && f.oursRow && (
              <div style={{ border: "1px solid var(--gold)", borderRadius: 12, padding: 14, background: "var(--surface)", marginBottom: 14 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 26 }}>
                  <Stat label="Oggi" value={`${f.ours.rank}°`} sub={`${f.ours.score} punti`} />
                  <Stat label="Previsto a fine stagione" value={`${f.oursRow.finalRank.p50}°`} sub={`di solito tra ${f.oursRow.finalRank.p10}° e ${f.oursRow.finalRank.p90}°`} />
                  <Stat label={`Nelle prime ${f.cutoff}`} value={pctText(f.oursRow.probTop)} color={probColor(f.oursRow.probTop)} sub={`l'${f.cutoff}° chiuderà a ~${f.cutoffScore.p50} punti`} />
                  <Stat label="Punti previsti" value={f.oursRow.finalScore.p50} sub={`tra ${f.oursRow.finalScore.p10} e ${f.oursRow.finalScore.p90}`} />
                </div>

                {f.oursRow && (
                  <div style={{ marginTop: 12, fontSize: 13, color: "var(--text-muted)" }}>
                    Per entrare nelle prime {f.cutoff} (soglia {f.target}):{" "}
                    <NeedBadges needed={f.oursRow.needed} full />
                  </div>
                )}

                {f.scenarios && (
                  <div style={{ marginTop: 14 }}>
                    <div className="f-mono" style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 6 }}>
                      Se nelle {f.sieges.used === 1 ? "prossima siege" : `${f.sieges.used} siege rimanenti`} facciamo…
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ color: "var(--text-faint)", textAlign: "left" }}>
                            <th style={{ padding: "4px 8px" }}>Piazzamento</th>
                            <th style={{ padding: "4px 8px" }}>Punti per siege</th>
                            <th style={{ padding: "4px 8px" }}>Posizione finale</th>
                            <th style={{ padding: "4px 8px" }}>Nelle prime {f.cutoff}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {f.scenarios.map((sc) => {
                            const mid = sc.cases[1];
                            const lo = sc.cases[0], hi = sc.cases[2];
                            const best = Math.min(lo.finalRank, hi.finalRank), worst = Math.max(lo.finalRank, hi.finalRank);
                            return (
                              <tr key={sc.key} style={{ borderTop: "1px solid var(--border-soft)" }}>
                                <td style={{ padding: "6px 8px" }}>{sc.label}</td>
                                <td className="f-mono" style={{ padding: "6px 8px" }}>{sign(lo.delta)} / <b>{sign(mid.delta)}</b> / {sign(hi.delta)}</td>
                                <td className="f-mono" style={{ padding: "6px 8px" }}><b>{mid.finalRank}°</b>{best !== worst ? ` (${best}°–${worst}°)` : ""}</td>
                                <td className="f-mono" style={{ padding: "6px 8px", color: probColor(mid.probTop) }}>{pctText(mid.probTop)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p style={{ fontSize: 11.5, color: "var(--text-faint)", margin: "8px 0 0", lineHeight: 1.5 }}>
                      Il valore in grassetto è il normale; gli altri due scattano se nel match c'è una gilda molto più forte o molto più debole di noi.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Classifica: cosa serve a ognuno */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              {[["all", "Tutte", f.counts.all, null], ["safe", "Sicure", f.counts.safe, "var(--green)"], ["needs", "Servono risultati", f.counts.needs, "#4d7ec2"], ["out", "Fuori", f.counts.out, "var(--red)"]].map(([k, label, n, c]) => (
                <button key={k} onClick={() => setFilter(k)} className="btn btn-ghost"
                  style={{ borderRadius: 999, borderColor: filter === k ? (c || "var(--gold)") : "var(--border)", background: filter === k ? "var(--surface-hover)" : "transparent" }}>
                  {c && <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 9, background: c, marginRight: 7 }} />}{label} {n}
                </button>
              ))}
              <input placeholder="Cerca una gilda" value={query} onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: 220, marginLeft: "auto" }} />
            </div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", overflow: "hidden", marginBottom: 14 }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 700 }}>
                  <thead>
                    <tr style={{ color: "var(--text-faint)", textAlign: "left", background: "var(--bg-soft)" }}>
                      <th style={th}>Pos.</th>
                      <th style={th}>Gilda</th>
                      <th style={th}>Punti</th>
                      <th style={th}>Servono (1° / 2° / 3°)</th>
                      <th style={th}>Finale</th>
                      <th style={th}>Stato</th>
                      <th style={th}>Prob. prime {f.cutoff}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.rows
                      .filter((r) => (filter === "all" || r.needed.status === filter) && (!query.trim() || fold(r.name).includes(fold(query.trim()))))
                      .map((r) => {
                        const mine = f.ours && r.guildId === f.ours.guildId;
                        const st = STATUS[r.needed.status];
                        return (
                          <tr key={r.guildId} style={{ borderTop: "1px solid var(--border-soft)", background: mine ? "rgba(211,169,79,.14)" : undefined }}>
                            <td className="f-mono" style={td}>{r.rank}°</td>
                            <td style={{ ...td, fontWeight: mine ? 700 : 400, color: mine ? "var(--gold)" : "var(--text)" }}>
                              {r.name}{mine ? " (noi)" : ""}
                              <span className="f-mono" style={{ fontSize: 10, marginLeft: 6, color: "var(--text-faint)" }}>{r.rating === 4003 ? "alto" : "basso"}</span>
                            </td>
                            <td className="f-mono" style={td}>{r.current}</td>
                            <td style={td}><NeedBadges needed={r.needed} /></td>
                            <td className="f-mono" style={{ ...td, color: r.needed.final ? "var(--green)" : "var(--text-faint)" }}>{r.needed.final ?? "—"}</td>
                            <td style={{ ...td, color: st.color, fontWeight: 600 }}>{st.label}</td>
                            <td style={td}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 60, height: 8, borderRadius: 4, background: "var(--border-soft)" }}>
                                  <div style={{ width: `${Math.round(r.probTop * 100)}%`, height: "100%", borderRadius: 4, background: probColor(r.probTop) }} />
                                </div>
                                <span className="f-mono" style={{ fontSize: 12, color: probColor(r.probTop) }}>{pctText(r.probTop)}</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border-soft)", fontSize: 11.5, color: "var(--text-faint)", lineHeight: 1.6 }}>
                "Servono" = risultati minimi nelle siege rimanenti (con +18 / +3 / −2) per arrivare alla soglia; "Finale" = punti che avrebbe con quei risultati.
                "alto/basso" = livello 4003/4002. Vedo solo le {f.visibleCount} gilde che il gioco mette in classifica.
              </div>
            </div>

            {/* Chi può sfidarci */}
            {f.ours && (
              <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "var(--surface)", marginBottom: 14 }}>
                <button className="btn btn-ghost" onClick={() => setShowOpp(!showOpp)}>
                  {showOpp ? "Nascondi" : "Chi potrebbe sfidarci"} ({f.opponents.length})
                </button>
                {showOpp && (
                  <div style={{ marginTop: 10 }}>
                    <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.6, margin: "0 0 10px" }}>
                      Gli avversari vengono sorteggiati nel nostro stesso livello ({f.ours.rating === 4003 ? "alto, 4003" : "basso, 4002"}), ma dallo storico delle nostre siege
                      non c'è nessun legame con la posizione: sono usciti avversari dal 1° posto a oltre il 100°. Qui sotto le gilde visibili del nostro livello:
                      altre, fuori dal top 100, non le vediamo. Non è una previsione di chi capiterà, solo di chi può capitare.
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 6 }}>
                      {f.opponents.map((o) => (
                        <div key={o.guildId} style={{ fontSize: 12.5, padding: "4px 8px", border: "1px solid var(--border-soft)", borderRadius: 6, display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <span>{o.name}</span>
                          <span className="f-mono" style={{ color: "var(--text-faint)" }}>{o.rank}° · {o.score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Come si calcola */}
            <details style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.7 }}>
              <summary style={{ cursor: "pointer", color: "var(--text)" }}>Come viene calcolata</summary>
              <div style={{ marginTop: 8 }}>
                "Servono" e lo stato (Sicura / Servono risultati / Fuori) sono calcolati con i punti normali (+18, +3, −2): Sicura se la gilda ci arriva anche perdendo tutte le siege rimaste, Fuori se non ci arriva nemmeno vincendole tutte; la soglia è il punteggio medio con cui, nella simulazione, si chiude l'ultimo posto utile. Ogni siege mette di fronte 3 gilde: chi arriva 1° prende <b>+16/+18/+20</b>, 2° <b>+1/+3/+5</b>, 3° <b>−3/−2/−1</b>
                (gli estremi dipendono dalla differenza di punti con la media del match). Per ogni gilda del top 100 simulo {f.sims.toLocaleString("it-IT")} volte le siege rimaste,
                pescando le variazioni dalle classifiche passate della sua fascia di posizione ({f.poolPairs ? `${f.poolPairs} confronti raccolti dal plugin + ` : ""}storico di luglio–ottobre).
                Non conosco gli accoppiamenti futuri, quindi è una probabilità, non un risultato. Le gilde fuori dal top 100 non sono visibili e possono comunque entrare;
                chi ha giocato poco o niente conta come variazione 0. La fascia più bassa del top 100 è ribilanciata (un terzo vittorie, pareggi, sconfitte) perché chi perde esce dalla lista e sparirebbe dai dati.
              </div>
            </details>
          </>
        )}
        {state.loading && !f && !state.error && !state.empty && <LoadingScreen />}

        <ArchiveSection />
      </div>
    </div>
  );
}

const th = { padding: "8px 10px", fontWeight: 600, fontSize: 12 };
const td = { padding: "6px 10px" };

function Box({ children, color }) {
  return (
    <div style={{ border: `1px solid ${color || "var(--border)"}`, borderRadius: 12, padding: 16, background: "var(--surface)", color: color || "var(--text-muted)", fontSize: 13.5, lineHeight: 1.6, marginBottom: 14 }}>
      {children}
    </div>
  );
}

function Stat({ label, value, sub, color }) {
  return (
    <div style={{ minWidth: 130 }}>
      <div className="f-mono" style={{ fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-faint)" }}>{label}</div>
      <div className="f-hero" style={{ fontSize: 26, color: color || "var(--gold)", lineHeight: 1.2 }}>{value}</div>
      {sub && <div className="f-mono" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

const STATUS = {
  safe: { label: "Sicura", color: "var(--green)" },
  needs: { label: "Servono risultati", color: "#4d7ec2" },
  out: { label: "Fuori", color: "var(--red)" },
};

function Card({ label, value, sub, color }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", background: "var(--surface)" }}>
      <div className="f-mono" style={{ fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-faint)" }}>{label}</div>
      <div className="f-hero" style={{ fontSize: 24, color: color || "var(--text)", lineHeight: 1.25 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

// Servono: vittorie / pareggi / sconfitte.
function NeedBadges({ needed, full }) {
  if (needed.status === "safe") return <span style={{ color: "var(--green)" }}>già dentro anche perdendo tutto</span>;
  if (needed.status === "out") return <span style={{ color: "var(--red)" }}>non ci arriva nemmeno vincendo tutto</span>;
  const c = needed.combo;
  const b = (n, bg, fg, title) => (
    <span title={title} className="f-mono" style={{ display: "inline-block", minWidth: 24, textAlign: "center", padding: "1px 7px", borderRadius: 6, background: bg, color: fg, fontWeight: 700, marginRight: 5 }}>{n}</span>
  );
  return (
    <span>
      {b(c.w, "rgba(211,169,79,.25)", "var(--gold)", "1° nel match (vittoria)")}
      {b(c.d, "rgba(77,126,194,.25)", "#8fb4e8", "2° nel match (pareggio)")}
      {b(c.l, "rgba(216,72,82,.22)", "#ff8d95", "3° nel match (sconfitta)")}
      {full && <span style={{ fontSize: 12, color: "var(--text-faint)" }}>vittorie / pareggi / sconfitte</span>}
    </span>
  );
}

// Stagioni concluse: archiviate da sole quando arriva la prima classifica della stagione dopo.
function ArchiveSection() {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    fetch("/api/siege-forecast?archive=list").then((r) => r.json()).then((d) => {
      if (d.ok) { setList(d.seasons); if (d.seasons[0]) setSel(d.seasons[0].seasonId); } else setList([]);
    }).catch(() => setList([]));
  }, []);
  useEffect(() => {
    if (sel == null) return;
    setDetail(null);
    fetch(`/api/siege-forecast?archive=${sel}`).then((r) => r.json()).then((d) => setDetail(d.ok ? d.season : false)).catch(() => setDetail(false));
  }, [sel]);

  if (list === null) return null;
  const meta = list.find((x) => x.seasonId === sel);
  const rows = detail ? detail.final.rows.slice().sort((x, y) => x[0] - y[0]) : [];
  const ours = detail && detail.final.ours;
  return (
    <details open={open} onToggle={(e) => setOpen(e.target.open)} style={{ marginTop: 18, fontSize: 13.5 }}>
      <summary style={{ cursor: "pointer", color: "var(--text)", fontWeight: 600 }}>Stagioni concluse ({list.length})</summary>
      <div style={{ marginTop: 10 }}>
        {!list.length && <Box>Nessuna stagione archiviata ancora. La prima verrà salvata da sola all'inizio della stagione nuova.</Box>}
        {list.length > 0 && (
          <>
            <select value={sel ?? ""} onChange={(e) => setSel(parseInt(e.target.value, 10))} style={{ marginBottom: 10 }}>
              {list.map((x) => (
                <option key={x.seasonId} value={x.seasonId}>Stagione {x.seasonNumber ?? x.seasonId}{x.end ? ` (fino al ${fmtDay(x.end)})` : ""}</option>
              ))}
            </select>
            {detail === null && <div style={{ color: "var(--text-muted)" }}>Carico…</div>}
            {detail === false && <Box color="var(--red)">Non riesco a caricare questa stagione.</Box>}
            {detail && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
                  <Card label="Il nostro risultato" value={ours ? `${ours.rank}°` : "?"} sub={ours ? `${ours.score} punti` : ""} color="var(--gold)" />
                  <Card label="Ultimo posto utile (32°)" value={meta && meta.cutoff32 != null ? meta.cutoff32 : "?"} sub="punti" />
                  <Card label="Periodo" value={detail.begin ? `${fmtDay(detail.begin)} → ${fmtDay(detail.end)}` : "?"} sub={`${detail.snapshotCount} classifiche salvate`} />
                </div>
                {detail.final.stale && <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 8 }}>L'ultima classifica salvata poteva non includere l'ultima siege.</div>}
                <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "var(--text-faint)" }}>
                        <th style={th}>Pos.</th><th style={th}>Gilda</th><th style={{ ...th, textAlign: "right" }}>Punti</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const me = ours && r[1] === ours.guildId;
                        return (
                          <tr key={r[1]} style={{ background: me ? "rgba(211,169,79,.15)" : "transparent", borderBottom: r[0] === 32 ? "2px dashed var(--gold)" : "1px solid var(--border)" }}>
                            <td style={td} className="f-mono">{r[0]}</td>
                            <td style={{ ...td, fontWeight: me ? 700 : 400 }}>{r[2]}</td>
                            <td style={{ ...td, textAlign: "right" }} className="f-mono">{r[3]}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </details>
  );
}
