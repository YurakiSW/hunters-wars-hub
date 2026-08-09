import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { redis } from "../../../../lib/redis";
import { safeJson } from "../../../../lib/apiUtils";

// Preferiti personali — mai condivisi tra account, ognuno vede/gestisce
// solo i propri. Un solo campo per tipo sull'utente, toggle semplice.
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });

  const { data } = await safeJson(request);
  if (!data?.id || (data.type !== "deck" && data.type !== "counter")) {
    return NextResponse.json({ error: "Parametri mancanti o non validi." }, { status: 400 });
  }

  const field = data.type === "deck" ? "favoriteDeckIds" : "favoriteCounterIds";
  const current = new Set(user[field] || []);
  if (current.has(data.id)) current.delete(data.id);
  else current.add(data.id);

  const updated = { ...user, [field]: [...current] };
  await redis.set(`user:${user.id}`, updated);
  return NextResponse.json({ ok: true, [field]: [...current] });
}
