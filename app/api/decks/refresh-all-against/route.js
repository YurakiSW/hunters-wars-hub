import { NextResponse } from "next/server";
import { getCurrentUser, canManageDecks } from "../../../../lib/auth";
import { refreshAllAgainstFromCounters } from "../../../../lib/decks";

export async function POST() {
  const user = await getCurrentUser();
  if (!user || !canManageDecks(user)) {
    return NextResponse.json({ error: "Solo Admin e Deck Builder possono aggiornare da Counter." }, { status: 403 });
  }
  const result = await refreshAllAgainstFromCounters();
  return NextResponse.json({ ok: true, ...result });
}
