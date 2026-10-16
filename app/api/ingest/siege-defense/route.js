import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { redis } from "../../../../lib/redis";
import { safeJson } from "../../../../lib/apiUtils";
import { importSiegeDefenseLog, listSieges, getGuildName } from "../../../../lib/guildDefenses";

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

    return NextResponse.json({ error: "Azione sconosciuta." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: `Import fallito: ${String(err.message || err)}` }, { status: 500 });
  }
}
