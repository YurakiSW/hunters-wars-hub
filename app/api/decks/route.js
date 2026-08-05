import { NextResponse } from "next/server";
import { getCurrentUser, canManageDecks } from "../../../lib/auth";
import { listDecks, createDeckFromScratch } from "../../../lib/decks";
import { isKnownMonster } from "../../../lib/monsters";
import { validateCounterPayload } from "../../../lib/gameData";
import { safeJson } from "../../../lib/apiUtils";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.status !== "approved") {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }
  const decks = await listDecks();
  return NextResponse.json({ decks });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !canManageDecks(user)) {
    return NextResponse.json({ error: "Solo Admin e Deck Builder possono creare un deck." }, { status: 403 });
  }

  const { data: payload, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });

  // Stesso validatore già usato per i Counter: la forma della squadra
  // (rune/stat/artefatti/combat stats/turnOrder) è identica.
  const errors = validateCounterPayload({ ...payload, focus: payload.focus || [] });
  if (errors.length) {
    return NextResponse.json({ error: "Campi mancanti o non validi: " + errors.join("; ") }, { status: 400 });
  }
  for (const u of payload.units) {
    if (!(await isKnownMonster(u.name))) {
      return NextResponse.json({ error: `"${u.name}" non è un mostro riconosciuto.` }, { status: 400 });
    }
  }

  const deck = await createDeckFromScratch({
    units: payload.units,
    turnOrder: payload.turnOrder,
    strategy: payload.strategy,
    warning: payload.warning,
    video: payload.video,
    images: payload.images,
    authorId: user.id,
    authorNickname: user.nickname,
  });
  return NextResponse.json({ deck });
}
