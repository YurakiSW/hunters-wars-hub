import { NextResponse } from "next/server";
import { getCurrentUser, canManage } from "../../../../../lib/auth";
import { getTwinPairs, setTwin, setTwinsBulk, removeTwin } from "../../../../../lib/monsters";
import { safeJson } from "../../../../../lib/apiUtils";

// GET: elenco delle coppie collab <-> versione normale. Lettura libera per
// chiunque sia loggato: serve a TUTTE le pagine per disegnare l'icona
// "mezza e mezza", non è un dato riservato ai gestori.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  const pairs = await getTwinPairs();
  return NextResponse.json({ ok: true, pairs });
}

// POST: aggiunge o rimuove una coppia. Solo Admin/Revisori: cambiare queste
// coppie cambia il modo in cui i counter vengono raggruppati.
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !canManage(user)) {
    return NextResponse.json({ error: "Solo Admin e Revisori possono gestire le coppie collab." }, { status: 403 });
  }
  const { data, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });

  try {
    if (data.action === "remove") {
      await removeTwin(data.altName);
      return NextResponse.json({ ok: true, pairs: await getTwinPairs() });
    }
    if (data.action === "bulk") {
      const result = await setTwinsBulk(data.entries);
      return NextResponse.json({ ok: true, ...result, pairs: await getTwinPairs() });
    }
    await setTwin(data.altName, data.canonicalName);
    return NextResponse.json({ ok: true, pairs: await getTwinPairs() });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 400 });
  }
}
