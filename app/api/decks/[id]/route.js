import { NextResponse } from "next/server";
import { getCurrentUser, canManageDecks } from "../../../../lib/auth";
import { getDeck, updateDeck, deleteDeck } from "../../../../lib/decks";
import { isKnownMonster } from "../../../../lib/monsters";
import { validateCounterPayload } from "../../../../lib/gameData";
import { safeJson } from "../../../../lib/apiUtils";

export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!user || !canManageDecks(user)) {
    return NextResponse.json({ error: "Solo Admin e Deck Builder possono modificare un deck." }, { status: 403 });
  }
  const deck = await getDeck(params.id);
  if (!deck) return NextResponse.json({ error: "Deck non trovato." }, { status: 404 });

  const { data: payload, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });

  // buildName è l'unico campo che si può cambiare da solo, senza reinviare
  // tutta la squadra (rinomina rapida della riga).
  if (payload.buildName !== undefined && payload.units === undefined) {
    const updated = await updateDeck(params.id, { buildName: payload.buildName });
    return NextResponse.json({ deck: updated });
  }

  if (payload.units) {
    const errors = validateCounterPayload(payload);
    if (errors.length) {
      return NextResponse.json({ error: "Campi mancanti o non validi: " + errors.join("; ") }, { status: 400 });
    }
    for (const u of payload.units) {
      if (!(await isKnownMonster(u.name))) {
        return NextResponse.json({ error: `"${u.name}" non è un mostro riconosciuto.` }, { status: 400 });
      }
    }
  }

  const updated = await updateDeck(params.id, payload);
  return NextResponse.json({ deck: updated });
}

export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!user || !canManageDecks(user)) {
    return NextResponse.json({ error: "Solo Admin e Deck Builder possono eliminare un deck." }, { status: 403 });
  }
  const deck = await getDeck(params.id);
  if (!deck) return NextResponse.json({ error: "Deck non trovato." }, { status: 404 });
  await deleteDeck(params.id);
  return NextResponse.json({ ok: true });
}
