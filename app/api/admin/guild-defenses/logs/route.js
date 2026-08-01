import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../../lib/auth";
import { listGuildDefenseLogs, deleteGuildDefenseLogs, getGuildName, setGuildName } from "../../../../../lib/guildDefenses";
import { safeJson } from "../../../../../lib/apiUtils";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo Admin possono vedere lo storico log Difese Gilda." }, { status: 403 });
  }
  const [logs, guildName] = await Promise.all([listGuildDefenseLogs(), getGuildName()]);
  return NextResponse.json({ ok: true, logs, guildName });
}

// POST fa doppio servizio: cancellazione log (singola o in blocco) e
// cambio nome gilda — entrambe azioni ristrette agli Admin, non serve una
// route a parte per un solo campo.
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo Admin possono modificare i log Difese Gilda." }, { status: 403 });
  }
  const { data, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });

  if (data.action === "set_guild_name") {
    try {
      const name = await setGuildName(data.name);
      return NextResponse.json({ ok: true, guildName: name });
    } catch (err) {
      return NextResponse.json({ error: String(err.message || err) }, { status: 400 });
    }
  }
  if (data.action === "delete") {
    const ids = Array.isArray(data.logIds) ? data.logIds : [data.logIds].filter(Boolean);
    if (!ids.length) return NextResponse.json({ error: "Nessun log da eliminare." }, { status: 400 });
    const result = await deleteGuildDefenseLogs(ids);
    return NextResponse.json({ ok: true, ...result });
  }
  return NextResponse.json({ error: "Azione non valida." }, { status: 400 });
}
