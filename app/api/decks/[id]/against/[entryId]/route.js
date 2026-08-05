import { NextResponse } from "next/server";
import { getCurrentUser, canManageDecks } from "../../../../../../lib/auth";
import { removeAgainstEntry } from "../../../../../../lib/decks";

export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!user || !canManageDecks(user)) {
    return NextResponse.json({ error: "Solo Admin e Deck Builder possono modificare \"Da usare contro\"." }, { status: 403 });
  }
  const deck = await removeAgainstEntry(params.id, params.entryId);
  if (!deck) return NextResponse.json({ error: "Deck non trovato." }, { status: 404 });
  return NextResponse.json({ deck });
}
