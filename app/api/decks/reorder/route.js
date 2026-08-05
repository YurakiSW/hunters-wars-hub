import { NextResponse } from "next/server";
import { getCurrentUser, canManageDecks } from "../../../../lib/auth";
import { reorderDecks } from "../../../../lib/decks";
import { safeJson } from "../../../../lib/apiUtils";

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !canManageDecks(user)) {
    return NextResponse.json({ error: "Solo Admin e Deck Builder possono riordinare i deck." }, { status: 403 });
  }
  const { data, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });
  if (!Array.isArray(data.orderedIds)) {
    return NextResponse.json({ error: "Lista ordine mancante." }, { status: 400 });
  }
  const result = await reorderDecks(data.orderedIds);
  return NextResponse.json(result);
}
