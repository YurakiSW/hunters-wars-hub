import { NextResponse } from "next/server";
import { getCurrentUser, canManage, isAdmin } from "../../../../lib/auth";
import { listSieges, setSiegeIncluded, deleteSiege, getGuildName, setGuildName } from "../../../../lib/guildDefenses";
import { safeJson } from "../../../../lib/apiUtils";

// GET: elenco siege — visibile a chiunque sia loggato (serve anche solo per
// capire quali siege sono incluse quando si guarda la pagina pubblica).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  const [sieges, guildName] = await Promise.all([listSieges(), getGuildName()]);
  return NextResponse.json({ ok: true, sieges, guildName });
}

// POST: include/escludi è aperto a TUTTI gli approvati (non cambia dati
// per sempre, solo cosa conta nel riepilogo condiviso — stesso principio
// di "chiunque può proporre un counter"). Elimina resta SOLO Admin
// (irreversibile), cambiare il nome gilda resta Admin+Revisori (impostazione).
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  const { data, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });

  if (data.action === "delete") {
    if (!isAdmin(user)) {
      return NextResponse.json({ error: "Solo gli Admin possono eliminare una siege." }, { status: 403 });
    }
    const result = await deleteSiege(data.siegeKey);
    return NextResponse.json({ ok: true, ...result });
  }

  if (data.action === "set_included") {
    if (user.status !== "approved") {
      return NextResponse.json({ error: "Solo gli utenti approvati possono farlo." }, { status: 403 });
    }
    try {
      const record = await setSiegeIncluded(data.siegeKey, data.included);
      return NextResponse.json({ ok: true, siege: record });
    } catch (err) {
      return NextResponse.json({ error: String(err.message || err) }, { status: 400 });
    }
  }

  if (!canManage(user)) {
    return NextResponse.json({ error: "Solo Admin e Revisori possono farlo." }, { status: 403 });
  }
  if (data.action === "set_guild_name") {
    try {
      const name = await setGuildName(data.name);
      return NextResponse.json({ ok: true, guildName: name });
    } catch (err) {
      return NextResponse.json({ error: String(err.message || err) }, { status: 400 });
    }
  }
  return NextResponse.json({ error: "Azione non valida." }, { status: 400 });
}
