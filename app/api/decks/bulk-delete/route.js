import { NextResponse } from "next/server";
import { getCurrentUser, canManageDecks } from "../../../../lib/auth";
import { bulkDeleteDecks } from "../../../../lib/decks";
import { safeJson } from "../../../../lib/apiUtils";

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !canManageDecks(user)) {
    return NextResponse.json({ error: "Solo Admin e Deck Builder possono eliminare deck in blocco." }, { status: 403 });
  }
  const { data, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });
  if (!Array.isArray(data.ids) || !data.ids.length) {
    return NextResponse.json({ error: "Nessun deck selezionato." }, { status: 400 });
  }
  const result = await bulkDeleteDecks(data.ids);
  return NextResponse.json(result);
}
