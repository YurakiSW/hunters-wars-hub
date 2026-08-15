import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../../lib/auth";
import { recomputeApprovedCounterStats } from "../../../../../lib/siegeStats";

// Rigenera le Combat Stats di tutti i counter pubblicati dal Siege Log,
// usando le regole di calcolo attuali (bonus set, stat base per mostro,
// leader skill). I counter corretti a mano non vengono toccati.

// Il ricalcolo tocca tutti i counter approvati: con qualche centinaio serve
// più dei 10 secondi di default. 60 è il massimo consentito dal piano.
export const maxDuration = 60;

export async function POST() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo Admin." }, { status: 403 });
  }
  const result = await recomputeApprovedCounterStats();
  return NextResponse.json({ ok: true, ...result });
}
