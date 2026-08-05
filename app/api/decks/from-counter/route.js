import { NextResponse } from "next/server";
import { getCurrentUser, canManageDecks } from "../../../../lib/auth";
import { getCounter } from "../../../../lib/defs";
import { createDeckFromCounter } from "../../../../lib/decks";
import { safeJson } from "../../../../lib/apiUtils";

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !canManageDecks(user)) {
    return NextResponse.json({ error: "Solo Admin e Deck Builder possono creare un deck da un counter." }, { status: 403 });
  }
  const { data, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });

  const counter = await getCounter(data.counterId);
  if (!counter) return NextResponse.json({ error: "Counter non trovato." }, { status: 404 });
  if (counter.status !== "approved") {
    return NextResponse.json({ error: "Solo un counter già approvato può diventare un deck." }, { status: 400 });
  }

  const deck = await createDeckFromCounter(counter, { authorId: user.id, authorNickname: user.nickname });
  return NextResponse.json({ deck });
}
