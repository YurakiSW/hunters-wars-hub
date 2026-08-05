import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { redis } from "../../../../lib/redis";

// Incrementa il contatore devilmon dell'utente loggato — nessun altro dato
// toccato. Un solo campo semplice sul record utente (`devilmonCount`),
// niente di più: è un easter egg, non serve una struttura dati a parte.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });

  const newCount = (user.devilmonCount || 0) + 1;
  await redis.set(`user:${user.id}`, { ...user, devilmonCount: newCount });

  return NextResponse.json({ ok: true, count: newCount });
}
