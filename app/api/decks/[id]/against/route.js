import { NextResponse } from "next/server";
import { getCurrentUser, canManageDecks } from "../../../../../lib/auth";
import { addAgainstEntry } from "../../../../../lib/decks";
import { safeJson } from "../../../../../lib/apiUtils";

export async function POST(request, { params }) {
  const user = await getCurrentUser();
  if (!user || !canManageDecks(user)) {
    return NextResponse.json({ error: "Solo Admin e Deck Builder possono modificare \"Da usare contro\"." }, { status: 403 });
  }
  const { data, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });
  if (!Array.isArray(data.monsters) || data.monsters.some((m) => !m || !m.trim())) {
    return NextResponse.json({ error: "Servono i 3 mostri della difesa." }, { status: 400 });
  }
  const deck = await addAgainstEntry(params.id, data.monsters);
  if (!deck) return NextResponse.json({ error: "Deck non trovato." }, { status: 404 });
  return NextResponse.json({ deck });
}
