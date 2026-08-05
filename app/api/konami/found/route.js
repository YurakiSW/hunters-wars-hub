import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { redis } from "../../../../lib/redis";

// Registra SOLO la prima volta che un account attiva la sequenza — non un
// contatore, un singolo timestamp. Conta chi lo trova per primo/per primi,
// non quante volte lo rifà. Se già registrato, non tocca nulla (idempotente).
// Yuraki (chi ha scritto il codice) non viene mai registrata come
// "scopritrice" — ovviamente lo conosce già, non sarebbe un vero
// ritrovamento. La grafica resta comunque anche per lei (gira lato client,
// indipendente da questa chiamata).
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  if (user.nickname?.trim().toLowerCase() === "yuraki") return NextResponse.json({ ok: true, excluded: true });
  if (user.konamiFoundAt) return NextResponse.json({ ok: true, alreadyFound: true });

  await redis.set(`user:${user.id}`, { ...user, konamiFoundAt: Date.now() });
  return NextResponse.json({ ok: true, alreadyFound: false });
}
