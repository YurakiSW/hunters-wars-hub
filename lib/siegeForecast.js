import { redis } from "./redis";

// Previsione di fine stagione della classifica siege (27/10/2026, Flora).
//
// I DATI arrivano dal plugin SWEX, da soli: quando in gioco si apre la
// classifica siege (GetGuildSiegeRankingInfo, top 100 con punteggio) e la
// schermata stato siege (GetGuildSiegeStatusInfo, date della stagione).
//
// Come funzionano i punti (regola data da Flora, confermata dai log): in ogni
// siege si affrontano 3 gilde dello stesso livello; il piazzamento nel match
// decide il risultato e il punteggio cambia così
//   vittoria (1°)    +16 / +18 / +20
//   pareggio (2°)    +1  / +3  / +5
//   sconfitta (3°)   -3  / -2  / -1
// Il valore centrale è quello normale; gli estremi scattano quando nel match
// c'è una gilda molto più forte o molto più debole.
//
// ATTENZIONE, il ritardo della lista: subito dopo una siege il punteggio della
// nostra gilda (GetGuildSiegeRankingInfo -> guildsiege_ranking_info) è già
// aggiornato, mentre la LISTA della classifica resta indietro di una siege fino
// all'aggiornamento notturno. Si riconosce perché il nostro punteggio "ufficiale"
// differisce dalla nostra riga in lista. In quel caso la classifica è marcata
// "stale": per la nostra gilda la differenza è la variazione già avvenuta, per
// tutte le altre si conta una siege in più da stimare.
//
// LA STIMA: per ogni gilda si pescano a caso (migliaia di volte) le variazioni
// di punteggio per ogni siege rimasta, da quelle realmente osservate nelle
// classifiche passate per la sua fascia di posizione. Da lì si ricavano
// posizione e punteggio finali più probabili e la probabilità di stare nel
// top N. È una STIMA: non conosciamo gli accoppiamenti delle prossime siege.
//
// Chiavi Redis:
//   siegeRank:snaps   sorted set (score = orario) di classifiche compatte
//   siegeRank:season  { seasonId, seasonNumber, begin, end, ... } dell'ultima stagione vista
//   siegeRank:seasonInfo:{id}  date di ogni stagione vista
//   siegeRank:archive:index    set degli id delle stagioni concluse e archiviate
//   siegeRank:archive:{id}     stagione conclusa: classifica finale + tutte le classifiche salvate
//
// STAGIONI: quando arriva la prima classifica di una stagione NUOVA, quella appena
// finita viene archiviata da sola (classifica finale, nostro risultato finale, date)
// e tolta dal "vivo"; la previsione riparte da zero con la stagione nuova.

const SNAPS_KEY = "siegeRank:snaps";
const SEASON_KEY = "siegeRank:season";
const seasonInfoKey = (id) => `siegeRank:seasonInfo:${id}`;
const ARCHIVE_INDEX_KEY = "siegeRank:archive:index";
const archiveKey = (id) => `siegeRank:archive:${id}`;
const KEEP_SNAPSHOTS = 150;
const isInt = Number.isInteger;

export const BANDS = [[1, 10], [11, 35], [36, 60], [61, 100]];

// Variazioni per fascia osservate nelle classifiche di luglio-ottobre 2026
// (solo coppie di classifiche con UNA siege in mezzo). { delta: quante volte }
export const DEFAULT_POOLS = {"1-10": {"-3": 1, "-2": 3, "-1": 8, "1": 6, "3": 4, "5": 11, "16": 34, "18": 5, "20": 1}, "11-35": {"-3": 1, "-2": 40, "-1": 23, "0": 1, "1": 4, "3": 56, "5": 8, "16": 10, "18": 50, "20": 2}, "36-60": {"-2": 29, "1": 1, "3": 54, "16": 18, "18": 58}, "61-100": {"3": 13, "16": 15, "18": 83}};

export const OUTCOME_DELTAS = {
  win: [16, 18, 20],
  draw: [1, 3, 5],
  loss: [-3, -2, -1],
};

// ---------- Salvataggio -------------------------------------------------------

export function normalizeRanking(s) {
  if (!s || !isInt(s.t) || s.t < 1e9) return null;
  if (!Array.isArray(s.rows) || s.rows.length < 50 || s.rows.length > 100) return null;
  const rows = [];
  for (const r of s.rows) {
    if (!Array.isArray(r) || !isInt(r[0]) || !isInt(r[1]) || typeof r[2] !== "string" || !isInt(r[3]) || !isInt(r[4])) return null;
    rows.push([r[0], r[1], r[2].slice(0, 40), r[3], r[4]]);
  }
  let ours = null;
  if (s.ours && isInt(s.ours.guildId) && isInt(s.ours.score)) {
    ours = {
      guildId: s.ours.guildId, name: String(s.ours.name || "").slice(0, 40),
      rank: isInt(s.ours.rank) ? s.ours.rank : 0, score: s.ours.score, rating: isInt(s.ours.rating) ? s.ours.rating : 0,
    };
  }
  // Il ritardo della lista (vedi sopra): punteggio ufficiale diverso dalla nostra riga.
  const mine = ours ? rows.find((r) => r[1] === ours.guildId) : null;
  const stale = !!(mine && ours && mine[3] !== ours.score);
  return {
    stale, t: s.t, seasonId: isInt(s.seasonId) ? s.seasonId : null, seasonNumber: isInt(s.seasonNumber) ? s.seasonNumber : null,
    total: isInt(s.total) ? s.total : null, ours, rows,
  };
}

const fingerprint = (s) => JSON.stringify([s.ours ? s.ours.score : null, s.rows.map((r) => [r[1], r[3]])]);

function parseMember(m) {
  if (m && typeof m === "object") return m;
  try { return JSON.parse(m); } catch { return null; }
}

// Salva una classifica solo se è cambiata rispetto all'ultima salvata.
export async function addRankingSnapshot(input) {
  const snap = normalizeRanking(input);
  if (!snap) throw new Error("Classifica non valida (servono 50-100 righe con posizione, ID, nome, punti, livello).");
  const last = (await redis.zrange(SNAPS_KEY, -1, -1)).map(parseMember).filter(Boolean)[0];
  let archivedSeason = null;
  if (last && last.seasonId && snap.seasonId && last.seasonId !== snap.seasonId) {
    archivedSeason = await archiveSeason(last.seasonId);
  }
  if (!archivedSeason && last && fingerprint(last) === fingerprint(snap)) return { saved: false, stale: snap.stale, count: await redis.zcard(SNAPS_KEY) };
  await redis.zadd(SNAPS_KEY, { score: snap.t, member: JSON.stringify(snap) });
  const count = await redis.zcard(SNAPS_KEY);
  if (count > KEEP_SNAPSHOTS) await redis.zremrangebyrank(SNAPS_KEY, 0, count - KEEP_SNAPSHOTS - 1);
  return { saved: true, stale: snap.stale, count: Math.min(count, KEEP_SNAPSHOTS), archivedSeason };
}

// Archivia una stagione conclusa e la toglie dalle classifiche "vive".
// Le classifiche salvate restano nell'archivio (servono ancora per stimare le
// variazioni di punteggio), in forma più leggera: senza nomi.
export async function archiveSeason(seasonId) {
  const all = (await redis.zrange(SNAPS_KEY, 0, -1)).map(parseMember).filter(Boolean);
  const mine = all.filter((x) => x.seasonId === seasonId);
  if (!mine.length) return null;
  const consistent = mine.filter((x) => !x.stale);
  const fin = consistent.length ? consistent[consistent.length - 1] : mine[mine.length - 1];
  const info = (await redis.get(seasonInfoKey(seasonId))) || {};
  await redis.set(archiveKey(seasonId), {
    seasonId, seasonNumber: fin.seasonNumber,
    begin: info.begin || null, end: info.end || null, archivedAt: Date.now(),
    final: { t: fin.t, stale: !!fin.stale, ours: fin.ours, total: fin.total, rows: fin.rows },
    snapshots: mine.map((x) => ({ t: x.t, stale: !!x.stale, seasonId: x.seasonId, ours: x.ours, rows: x.rows.map((r) => [r[0], r[1], "", r[3], r[4]]) })),
  });
  await redis.sadd(ARCHIVE_INDEX_KEY, String(seasonId));
  await redis.zremrangebyscore(SNAPS_KEY, mine[0].t, mine[mine.length - 1].t);
  return { seasonId, seasonNumber: fin.seasonNumber, snapshots: mine.length };
}

export async function listArchivedSeasons() {
  const ids = await redis.smembers(ARCHIVE_INDEX_KEY);
  const items = (await Promise.all(ids.map((id) => redis.get(archiveKey(id))))).filter(Boolean);
  return items.map((a) => {
    const rows = a.final.rows.slice().sort((x, y) => x[0] - y[0] || y[3] - x[3]);
    const nth = rows[Math.min(32, rows.length) - 1];
    return {
      seasonId: a.seasonId, seasonNumber: a.seasonNumber, begin: a.begin, end: a.end, archivedAt: a.archivedAt,
      finalAt: a.final.t, ours: a.final.ours, total: a.final.total, snapshotCount: a.snapshots.length,
      cutoff32: nth ? nth[3] : null,
    };
  }).sort((x, y) => (y.end || y.finalAt) - (x.end || x.finalAt));
}

export async function getArchivedSeason(seasonId) {
  const a = await redis.get(archiveKey(seasonId));
  if (!a) return null;
  return { seasonId: a.seasonId, seasonNumber: a.seasonNumber, begin: a.begin, end: a.end, final: a.final, snapshotCount: a.snapshots.length };
}

export async function saveSeason(s) {
  if (!s || !isInt(s.t) || !isInt(s.end) || !isInt(s.begin) || s.end < s.begin) throw new Error("Dati stagione non validi.");
  const record = {
    t: s.t, seasonId: isInt(s.seasonId) ? s.seasonId : null, seasonNumber: isInt(s.seasonNumber) ? s.seasonNumber : null,
    begin: s.begin, end: s.end,
    contestBegin: isInt(s.contestBegin) ? s.contestBegin : null, contestEnd: isInt(s.contestEnd) ? s.contestEnd : null,
  };
  if (isInt(s.seasonId)) await redis.set(seasonInfoKey(s.seasonId), record); // le date di OGNI stagione, per l'archivio
  const cur = await redis.get(SEASON_KEY);
  if (cur && cur.t > s.t) return { saved: false };
  await redis.set(SEASON_KEY, record);
  return { saved: true };
}

export async function loadForecastData() {
  const raw = await redis.zrange(SNAPS_KEY, 0, -1);
  const snaps = raw.map(parseMember).filter(Boolean);
  const season = await redis.get(SEASON_KEY);
  // Per stimare le variazioni di punteggio si usano anche le stagioni già archiviate.
  const ids = await redis.smembers(ARCHIVE_INDEX_KEY);
  const archived = (await Promise.all(ids.map((id) => redis.get(archiveKey(id))))).filter(Boolean);
  const poolSeqs = [...archived.map((a) => a.snapshots), snaps];
  return { snaps, season, poolSeqs };
}

// ---------- Calendario siege ---------------------------------------------------
// Le siege partono lunedì e giovedì alle 12:00 ORA DI BERLINO (il fuso del
// server di gioco: 10:00 UTC d'estate, 11:00 UTC d'inverno) e il punteggio
// si aggiorna a fine siege (al massimo dopo 35 ore dall'inizio).

const SIEGE_HOURS = 35; // durata prevista: da lunedì/giovedì 12:00 a martedì/venerdì ~23:00 (ora di Berlino)

function berlinOffsetMs(utcMs) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const p = Object.fromEntries(parts.map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(utcMs / 1000) * 1000;
}

// Inizi delle siege (secondi UTC) tra due istanti.
export function siegeStartsBetween(fromSec, toSec) {
  const out = [];
  const day0 = new Date((fromSec - 3 * 86400) * 1000);
  let ms = Date.UTC(day0.getUTCFullYear(), day0.getUTCMonth(), day0.getUTCDate());
  for (; ms < (toSec + 86400) * 1000; ms += 86400000) {
    const d = new Date(ms);
    const dow = d.getUTCDay(); // 1 = lunedì, 4 = giovedì
    if (dow !== 1 && dow !== 4) continue;
    const guess = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12);
    const startMs = guess - berlinOffsetMs(guess);
    out.push(Math.round(startMs / 1000));
  }
  return out;
}

// Siege il cui punteggio viene applicato tra a e b.
export function siegesAppliedBetween(a, b) {
  return siegeStartsBetween(a, b).filter((s) => s + SIEGE_HOURS * 3600 > a && s + SIEGE_HOURS * 3600 <= b);
}

// Siege ancora da giocare dopo l'ultima classifica, fino a fine stagione.
export function remainingSieges(lastSnapT, seasonEnd) {
  if (!seasonEnd) return [];
  // +60 s di tolleranza: l'ultima siege finisce proprio a fine stagione (xx:59:59)
  return siegeStartsBetween(lastSnapT, seasonEnd).filter((s) => s > lastSnapT && s + SIEGE_HOURS * 3600 <= seasonEnd + 60);
}

// ---------- Pool di variazioni --------------------------------------------------

const bandOf = (rank) => { for (let i = 0; i < BANDS.length; i++) if (rank >= BANDS[i][0] && rank <= BANDS[i][1]) return i; return BANDS.length - 1; };
const VALID = new Set([-3, -2, -1, 0, 1, 3, 5, 16, 18, 20]);

// Aggiunge alle variazioni di default quelle osservate nelle classifiche salvate
// dal plugin (coppie con esattamente una siege in mezzo).
export function buildPools(seqs) {
  const pools = BANDS.map((b) => ({ ...(DEFAULT_POOLS[b[0] + "-" + b[1]] || {}) }));
  let pairs = 0;
  // Una lista di classifiche, oppure più liste (una per stagione): le coppie si
  // fanno solo tra classifiche della stessa stagione, perché a ogni stagione i punti ripartono.
  const lists = Array.isArray(seqs[0]) ? seqs : [seqs];
  for (const list of lists) {
    const ok = list.filter((x) => !x.stale);
    for (let i = 1; i < ok.length; i++) {
      const a = ok[i - 1], b = ok[i];
      if (a.seasonId && b.seasonId && a.seasonId !== b.seasonId) continue;
      if (siegesAppliedBetween(a.t, b.t).length !== 1) continue;
      pairs++;
      const prev = new Map(a.rows.map((r) => [r[1], r]));
      for (const r of b.rows) {
        const p = prev.get(r[1]);
        if (!p) continue;
        const d = r[3] - p[3];
        if (!VALID.has(d)) continue;
        const pool = pools[bandOf(p[0])];
        pool[d] = (pool[d] || 0) + 1;
      }
    }
  }
  return { pools, pairs };
}

function toSampler(pool) {
  const keys = Object.keys(pool).map(Number);
  const cum = []; let tot = 0;
  for (const k of keys) { tot += pool[k]; cum.push(tot); }
  return (u) => { const x = u * tot; for (let i = 0; i < cum.length; i++) if (x < cum[i]) return keys[i]; return keys[keys.length - 1]; };
}

// Le gilde in fondo al top 100 sono viste solo se RESTANO nel top 100: chi perde
// ne esce e sparisce dai dati, quindi la loro fascia è troppo ottimista. Per
// quella fascia si ribilancia: un terzo vittorie, un terzo pareggi, un terzo
// sconfitte (in ogni match c'è esattamente un 1°, un 2° e un 3°).
function makeSamplers(pools) {
  const samplers = pools.map(toSampler);
  const last = BANDS.length - 1;
  const merged = {};
  for (const i of [2, 3]) for (const [k, v] of Object.entries(pools[i])) merged[k] = (merged[k] || 0) + v;
  const byClass = { win: {}, draw: {}, loss: {} };
  for (const [k, v] of Object.entries(merged)) {
    const d = Number(k);
    const c = d >= 16 ? "win" : d > 0 ? "draw" : d < 0 ? "loss" : null;
    if (c) byClass[c][d] = v;
  }
  const sc = { win: toSampler(byClass.win), draw: toSampler(byClass.draw), loss: toSampler(byClass.loss) };
  samplers[last] = (u) => {
    const c = u < 1 / 3 ? "win" : u < 2 / 3 ? "draw" : "loss";
    return sc[c](((u * 3) % 1));
  };
  return samplers;
}

// ---------- Simulazione ----------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(p * (arr.length - 1))))];

// rows: [[rank, guildId, name, score, rating]]. fixedDelta: { guildId, delta } = risultato imposto a una gilda in ogni siege rimasta.
// pending: { guildId, delta } = variazione GIÀ avvenuta della nostra gilda (siege non ancora in lista);
// vale come primo passo, ma conta anche per tutte le altre gilde come passo da stimare.
export function simulate({ rows, pools, sieges, sims = 3000, cutoff = 60, seed = 1, fixed = null, pending = null }) {
  const samplers = makeSamplers(pools);
  const rnd = mulberry32(seed);
  const n = rows.length;
  const bands = rows.map((r) => bandOf(r[0]));
  const finalRanks = rows.map(() => new Array(sims));
  const finalScores = rows.map(() => new Array(sims));
  const topCount = new Array(n).fill(0);
  const cutScores = new Array(sims);
  const scores = new Array(n);
  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < n; i++) {
      let sc = rows[i][3];
      let steps = sieges;
      if (pending && rows[i][1] === pending.guildId) { sc += pending.delta; steps = Math.max(0, sieges - 1); }
      if (fixed && rows[i][1] === fixed.guildId) sc += fixed.delta * steps;
      else for (let k = 0; k < steps; k++) sc += samplers[bands[i]](rnd());
      scores[i] = sc;
    }
    const sorted = scores.slice().sort((a, b) => b - a);
    cutScores[s] = sorted[Math.min(cutoff, n) - 1];
    // posizione in stile gioco: 1 + gilde con punteggio strettamente maggiore
    const firstIdx = new Map();
    sorted.forEach((v, idx) => { if (!firstIdx.has(v)) firstIdx.set(v, idx + 1); });
    for (let i = 0; i < n; i++) {
      const rk = firstIdx.get(scores[i]);
      finalRanks[i][s] = rk; finalScores[i][s] = scores[i];
      if (rk <= cutoff) topCount[i]++;
    }
  }
  const result = rows.map((r, i) => {
    const fr = finalRanks[i].slice().sort((a, b) => a - b);
    const fs = finalScores[i].slice().sort((a, b) => a - b);
    return {
      rank: r[0], guildId: r[1], name: r[2], score: r[3], rating: r[4],
      finalRank: { p10: pct(fr, 0.1), p50: pct(fr, 0.5), p90: pct(fr, 0.9) },
      finalScore: { p10: pct(fs, 0.1), p50: pct(fs, 0.5), p90: pct(fs, 0.9) },
      probTop: topCount[i] / sims,
    };
  });
  const cs = cutScores.slice().sort((a, b) => a - b);
  const mean = cutScores.reduce((x, y) => x + y, 0) / cutScores.length;
  return { rows: result, cutoffScore: { p10: pct(cs, 0.1), p50: pct(cs, 0.5), p90: pct(cs, 0.9), mean } };
}

// ---------- "Cosa serve" per entrare nel torneo (stile SWGT) -------------------------
// Con i valori centrali (+18 / +3 / -2) cerca, per ogni gilda, la combinazione
// MINIMA di 1°/2°/3° nelle siege rimaste che porta al punteggio soglia.
// Sicura = ci arriva anche perdendo tutto; Fuori = non ci arriva nemmeno vincendo tutto.
export const MID = { win: 18, draw: 3, loss: -2 };

export function neededResults(score, steps, target) {
  const need = target - score;
  const worst = MID.loss * steps, best = MID.win * steps;
  let status = "needs";
  if (worst >= need) status = "safe";
  else if (best < need) status = "out";
  let combo = null;
  if (status === "needs") {
    for (let w = 0; w <= steps; w++) {
      for (let d = 0; d <= steps - w; d++) {
        const l = steps - w - d;
        const delta = MID.win * w + MID.draw * d + MID.loss * l;
        if (delta >= need && (!combo || delta < combo.delta)) combo = { w, d, l, delta };
      }
    }
  }
  return { status, need, combo, final: combo ? score + combo.delta : null };
}

// ---------- Forecast completo per la pagina ----------------------------------------

const STAR_CUTOFF = 50; // posti con 3 stelle

export function buildForecast({ snaps, poolSeqs = null, season: seasonIn, cutoff = 32, siegesOverride = null, sims = 3000 }) {
  if (!snaps.length) return null;
  const latest = snaps[snaps.length - 1];
  // Le date salvate valgono solo se sono della stessa stagione della classifica.
  const season = seasonIn && (!latest.seasonId || !seasonIn.seasonId || seasonIn.seasonId === latest.seasonId) ? seasonIn : null;
  const auto = remainingSieges(latest.t, season?.end || 0);
  const autoUsed = Number.isInteger(siegesOverride) ? Math.max(0, Math.min(6, siegesOverride)) : auto.length;
  const ours = latest.ours;
  // Lista in ritardo di una siege: per noi la variazione è nota, per gli altri è un passo in più.
  const mine = ours ? latest.rows.find((r) => r[1] === ours.guildId) : null;
  const pending = latest.stale && mine ? { guildId: ours.guildId, delta: ours.score - mine[3] } : null;
  const sieges = autoUsed + (pending ? 1 : 0);
  const { pools, pairs } = buildPools(poolSeqs || [snaps]);
  const seed = latest.t % 2147483647;
  const base = simulate({ rows: latest.rows, pools, sieges, sims, cutoff, seed, pending });
  // Stelle: il livello 3★ (rating 4003) copre i primi ~50 posti, dal 51° in giù è 2★
  // (verificato su tutte le classifiche salvate da luglio). Stessa simulazione, soglia 50.
  const star = cutoff === STAR_CUTOFF ? base : simulate({ rows: latest.rows, pools, sieges, sims, cutoff: STAR_CUTOFF, seed, pending });
  const star3 = new Map(star.rows.map((r) => [r.guildId, r.probTop]));

  const oursRow = ours ? base.rows.find((r) => r.guildId === ours.guildId) || null : null;

  // Scenari per noi: come finiamo se in OGNI siege rimasta facciamo 1°/2°/3°.
  let scenarios = null;
  if (ours && oursRow && autoUsed > 0) {
    scenarios = [];
    for (const [key, label] of [["win", "1° nel match (vittoria)"], ["draw", "2° nel match (pareggio)"], ["loss", "3° nel match (sconfitta)"]]) {
      const [low, mid, high] = OUTCOME_DELTAS[key];
      const cases = [low, mid, high].map((delta) => {
        const sim = simulate({ rows: latest.rows, pools, sieges, sims: 1200, cutoff, seed: seed + 7, fixed: { guildId: ours.guildId, delta }, pending });
        const me = sim.rows.find((r) => r.guildId === ours.guildId);
        return { delta, finalScore: me.finalScore.p50, finalRank: me.finalRank.p50, probTop: me.probTop };
      });
      scenarios.push({ key, label, cases });
    }
  }

  // Chi può capitarci: stesso livello (rating) della nostra gilda, tra quelli visibili.
  const opponents = ours
    ? latest.rows.filter((r) => r[4] === ours.rating && r[1] !== ours.guildId).map((r) => ({ rank: r[0], guildId: r[1], name: r[2], score: r[3] }))
    : [];

  // Soglia: punteggio medio con cui, secondo la simulazione, si chiude l'N° posto a fine stagione.
  const target = Math.ceil(base.cutoffScore.mean);
  const sortedNow = latest.rows.slice().sort((a, b) => a[0] - b[0] || b[3] - a[3]);
  const nthRow = sortedNow[Math.min(cutoff, sortedNow.length) - 1];
  const nthNow = nthRow ? { rank: nthRow[0], name: nthRow[2], score: nthRow[3] } : null;
  const counts = { all: 0, safe: 0, needs: 0, out: 0 };
  const tableRows = base.rows.map((r) => {
    const isOurs = !!(ours && r.guildId === ours.guildId);
    const score0 = isOurs ? ours.score : r.score;
    const steps = isOurs ? autoUsed : sieges;
    const nr = neededResults(score0, steps, target);
    counts.all++; counts[nr.status]++;
    const p3 = star3.get(r.guildId) ?? 0;
    const now = r.rating ? r.rating % 10 : null;
    return { ...r, current: score0, needed: nr, stars: { now, prob3: p3, final: p3 >= 0.5 ? 3 : 2 } };
  }).sort((a, b) => a.rank - b.rank || b.current - a.current);

  return {
    snapshotAt: latest.t, snapshotCount: snaps.length,
    season: season || null,
    stale: !!latest.stale, pending,
    sieges: { auto: auto.length, used: autoUsed, simulated: sieges, dates: auto },
    cutoff, sims, poolPairs: pairs,
    ours, oursRow: (ours && tableRows.find((r) => r.guildId === ours.guildId)) || oursRow, scenarios, opponents,
    cutoffScore: base.cutoffScore,
    target,
    nthNow,
    counts,
    rows: tableRows,
    visibleCount: latest.rows.length,
    tierBoundaryRank: (() => { let m = 0; for (const r of latest.rows) if (r[4] === Math.max(...latest.rows.map((x) => x[4]))) m = Math.max(m, r[0]); return m; })(),
  };
}
