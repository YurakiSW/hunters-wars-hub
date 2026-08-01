import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../lib/auth";
import { unpinAllDefs } from "../../../../lib/defs";

// Toglie il pin da TUTTE le Difese — solo Admin (non Revisori): è un'azione
// che tocca l'intera gilda in un colpo solo, non un lavoro di curatela di
// tutti i giorni.
export async function POST() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo gli Admin possono togliere tutti i pin." }, { status: 403 });
  }
  const result = await unpinAllDefs();
  return NextResponse.json({ ok: true, ...result });
}
