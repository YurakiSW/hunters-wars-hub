import { NextResponse } from "next/server";
import { getCurrentUser, canManageDecks } from "../../../../../lib/auth";
import { duplicateDeck } from "../../../../../lib/decks";

export async function POST(request, { params }) {
  const user = await getCurrentUser();
  if (!user || !canManageDecks(user)) {
    return NextResponse.json({ error: "Solo Admin e Deck Builder possono duplicare un deck." }, { status: 403 });
  }
  const deck = await duplicateDeck(params.id, { authorId: user.id, authorNickname: user.nickname });
  if (!deck) return NextResponse.json({ error: "Deck non trovato." }, { status: 404 });
  return NextResponse.json({ deck });
}
