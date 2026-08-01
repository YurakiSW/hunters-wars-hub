import { NextResponse } from "next/server";
import { getCurrentUser, canManage } from "../../../../lib/auth";
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

// POST: includere/escludere una siege, eliminarla, o cambiare il nome
// gilda — tutte azioni che cambiano cosa vede TUTTA la gilda, riservate a
// chi gestisce i contenuti (Admin/Revisori), non un filtro personale.
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !canManage(user)) {
    return NextResponse.json({ error: "Solo Admin e Revisori possono modificare le siege incluse." }, { status: 403 });
  }
  const { data, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });

  if (data.action === "set_included") {
    try {
      const record = await setSiegeIncluded(data.siegeKey, data.included);
      return NextResponse.json({ ok: true, siege: record });
    } catch (err) {
      return NextResponse.json({ error: String(err.message || err) }, { status: 400 });
    }
  }
  if (data.action === "delete") {
    const result = await deleteSiege(data.siegeKey);
    return NextResponse.json({ ok: true, ...result });
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
