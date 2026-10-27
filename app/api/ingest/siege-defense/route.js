import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { redis } from "../../../../lib/redis";
import { safeJson } from "../../../../lib/apiUtils";
import { importSiegeDefenseLog, listSieges, getGuildName } from "../../../../lib/guildDefenses";
import { getRoster } from "../../../../lib/roster";
import { applyRosterUpdate, sameRoster } from "../../../../lib/rosterSync";
import { addRankingSnapshot, saveSeason } from "../../../../lib/siegeForecast";

// Riceve i log delle difese di gilda DIRETTAMENTE dal plugin SWEX (16/10/2026,
// Flora) — stesso import del caricamento a mano, quindi stessa deduplica: una
// battaglia già registrata viene scartata, le siege nuove nascono ESCLUSE.
//
// Non c'è il cookie di sessione (la chiama il PC con SWEX, non un browser):
// si autentica con una chiave segreta, variabile d'ambiente SWEX_INGEST_TOKEN
// su Vercel, mandata nell'header "x-ingest-token". Il middleware lascia
// passare /api/ingest/ proprio per questo motivo.
export const maxDuration = 60;

function tokenOk(request) {
  const expected = process.env.SWEX_INGEST_TOKEN;
  if (!expected || expected.length < 16) return "not-configured";
  const got = request.headers.get("x-ingest-token") || "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request) {
  const auth = tokenOk(request);
  if (auth === "not-configured") {
    return NextResponse.json({ error: "SWEX_INGEST_TOKEN non configurata su Vercel (almeno 16 caratteri)." }, { status: 503 });
  }
  if (!auth) return NextResponse.json({ error: "Chiave non valida." }, { status: 401 });

  const { data, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });

  try {
    // 1) "status": il plugin chiede cosa c'è già, per non rimandare le siege
    //    già registrate. Restituisce il nome gilda e, per ogni siege salvata,
    //    quante battaglie ci sono DAVVERO nel database (conteggio reale
    //    dell'elenco, non il contatore del riepilogo).
    if (data.action === "status") {
      const [guildName, sieges] = await Promise.all([getGuildName(), listSieges()]);
      const counts = await Promise.all(sieges.map((s) => redis.scard(`siegeDef:battles:bySiege:${s.siegeKey}`)));
      const known = {};
      sieges.forEach((s, i) => { known[`${s.siegeId}:${s.matchId}`] = counts[i]; });
      return NextResponse.json({ ok: true, guildName, known });
    }

    // 2) "import": una risposta GetGuildSiegeBattleLog (già ridotta dal plugin).
    //    Si ricostruisce il formato del log che l'import esistente già capisce,
    //    così non c'è un secondo percorso di codice da mantenere.
    if (data.action === "import") {
      const resp = data.response;
      if (!resp || resp.command !== "GetGuildSiegeBattleLog" || !Array.isArray(resp.log_list)) {
        return NextResponse.json({ error: "Risposta non valida (serve GetGuildSiegeBattleLog con log_list)." }, { status: 400 });
      }
      const text = `Request:\n{"command":"GetGuildSiegeBattleLog"}\nResponse:\n${JSON.stringify(resp)}\n`;
      const result = await importSiegeDefenseLog(text);
      return NextResponse.json({ ok: true, ...result });
    }

    // 3) "roster": la lista membri di gilda, mandata dal plugin quando il
    //    gioco la invia (GetGuildInfo / login). Stessa logica dell'upload a
    //    mano del JSON (applyRosterUpdate), con controlli in più perché qui
    //    non c'è una persona a guardare il risultato:
    //    - la gilda deve essere la NOSTRA (stesso nome salvato sul sito);
    //    - tra 10 e 30 membri (una lista monca non deve mai sovrascrivere);
    //    - ogni voce con nome, grado e ID account;
    //    - se è uguale a quella già salvata non si fa niente.
    if (data.action === "roster") {
      const guildName = await getGuildName();
      if (data.guildName !== guildName) {
        return NextResponse.json({ error: `Gilda "${data.guildName}" diversa da quella del sito ("${guildName}"): ignorata.` }, { status: 400 });
      }
      const entries = Array.isArray(data.entries) ? data.entries : [];
      const valid = entries.every((e) => e && typeof e.nickname === "string" && e.nickname.trim() &&
        Number.isInteger(e.grade) && Number.isInteger(e.wizardId));
      if (entries.length < 10 || entries.length > 30 || !valid) {
        return NextResponse.json({ error: `Lista membri non valida (${entries.length} voci, servono 10-30 con nome, grado e ID).` }, { status: 400 });
      }
      const clean = entries.map((e) => ({ nickname: e.nickname, grade: e.grade, wizardId: e.wizardId }));
      if (sameRoster(await getRoster(), clean)) {
        return NextResponse.json({ ok: true, changed: false, count: clean.length });
      }
      const { count, notFound } = await applyRosterUpdate(clean);
      return NextResponse.json({ ok: true, changed: true, count, notFound: notFound.length });
    }

    // 4) "siegeRanking" e "siegeSeason": classifica siege (top 100) e date della
    //    stagione, mandate dal plugin quando in gioco si apre la classifica /
    //    la schermata siege. Alimentano la pagina "Previsione Siege".
    //    La classifica deve contenere la NOSTRA gilda (stesso nome del sito).
    if (data.action === "siegeRanking") {
      const guildName = await getGuildName();
      if (!data.snapshot || !data.snapshot.ours || data.snapshot.ours.name !== guildName) {
        return NextResponse.json({ error: `La classifica non è della gilda "${guildName}": ignorata.` }, { status: 400 });
      }
      const result = await addRankingSnapshot(data.snapshot);
      return NextResponse.json({ ok: true, ...result });
    }
    if (data.action === "siegeSeason") {
      const result = await saveSeason(data.season);
      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ error: "Azione sconosciuta." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: `Import fallito: ${String(err.message || err)}` }, { status: 500 });
  }
}
