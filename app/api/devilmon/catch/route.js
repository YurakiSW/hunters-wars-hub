import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { redis } from "../../../../lib/redis";
import { safeJson } from "../../../../lib/apiUtils";

// Incrementa il contatore devilmon dell'utente loggato. Uno "shiny" (raro,
// deciso lato client su AmbientSticker) vale 5 catture invece di 1 — non
// ci fidiamo del client per la rarità in sé (è solo un colore diverso),
// ma il valore in punti sì, non è nulla di sensibile da falsificare.
// Tiene anche una streak giornaliera: sale di 1 se l'ultima cattura era
// ieri, resta uguale se è già oggi, si azzera a 1 se è passato più di un
// giorno o è la prima volta.
// Bulk (whack-a-mole): amount catture in un colpo solo — clamp 1-20 per
// sicurezza, non ci si fida di un numero arbitrario mandato dal client.
// shiny e amount non si usano mai insieme (chiamanti diversi): shiny vale
// sempre 5 punti su UNA cattura, amount è per più catture in un colpo solo
// senza bonus shiny.
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });

  const { data } = await safeJson(request);
  const isShiny = data?.shiny === true;
  const amount = Math.min(Math.max(Number(data?.amount) || 1, 1), 20);
  const points = isShiny ? 5 : amount;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC, semplice e stabile)
  let streak = user.catchStreak || 0;
  if (user.lastCatchDate === today) {
    // già catturato oggi, la streak non cambia
  } else {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    streak = user.lastCatchDate === yesterday ? streak + 1 : 1;
  }

  const newCount = (user.devilmonCount || 0) + points;
  await redis.set(`user:${user.id}`, { ...user, devilmonCount: newCount, catchStreak: streak, lastCatchDate: today });

  return NextResponse.json({ ok: true, count: newCount, streak });
}
