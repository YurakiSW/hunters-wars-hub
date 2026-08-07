import { NextResponse } from "next/server";
import { getCurrentUser, canManageDecks } from "../../../../../lib/auth";
import { refreshAgainstFromCounters } from "../../../../../lib/decks";

export async function POST(request, { params }) {
  const user = await getCurrentUser();
  if (!user || !canManageDecks(user)) {
    return NextResponse.json({ error: "Solo Admin e Deck Builder possono aggiornare da Counter." }, { status: 403 });
  }
  const result = await refreshAgainstFromCounters(params.id);
  if (!result) return NextResponse.json({ error: "Deck non trovato." }, { status: 404 });
  return NextResponse.json({ ok: true, ...result });
}
