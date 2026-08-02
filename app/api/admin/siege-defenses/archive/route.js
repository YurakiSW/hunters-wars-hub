import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../../lib/auth";
import { archiveCurrentSeason } from "../../../../../lib/guildDefenses";
import { safeJson } from "../../../../../lib/apiUtils";

// Solo Admin: è un'azione che congela e svuota TUTTA la stagione corrente
// per l'intera gilda, non una scelta editoriale di tutti i giorni.
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo gli Admin possono archiviare la stagione." }, { status: 403 });
  }
  const { data } = await safeJson(request).catch(() => ({ data: {} }));
  try {
    const result = await archiveCurrentSeason(data?.siegeKeys);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 400 });
  }
}
