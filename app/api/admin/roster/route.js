import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../lib/auth";
import { getRoster, normalizeNickname } from "../../../../lib/roster";
import { applyRosterUpdate } from "../../../../lib/rosterSync";
import { redis } from "../../../../lib/redis";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  const roster = await getRoster();
  const notFound = (await redis.get("roster:removal_candidates")) || [];

  // Nickname del roster che non combaciano con NESSUN account esistente —
  // probabili candidati per un "associa nuovo nickname" (cambio nome in
  // gioco), da mostrare in un menu invece di dover eliminare l'account.
  const userIds = await redis.keys("user:user_*");
  const existingNicknames = new Set();
  for (const key of userIds) {
    const u = await redis.get(key);
    if (u?.nickname) existingNicknames.add(normalizeNickname(u.nickname));
  }
  const unassigned = roster
    .filter((r) => !existingNicknames.has(normalizeNickname(r.nickname)))
    .map((r) => r.nickname);

  return NextResponse.json({ roster, notFound, unassigned });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  if (!isAdmin(user) && !user.canUploadRoster) {
    return NextResponse.json({ error: "Non hai il permesso di caricare il roster (serve grado Vice o autorizzazione dell'Admin)." }, { status: 403 });
  }

  // Il browser ha già estratto solo nickname+grado dal file di gioco
  // (che può essere anche di svariati MB) prima di mandarlo qui — così non
  // trasferiamo mai al server dati di gioco non necessari.
  let entries;
  try {
    ({ entries } = await request.json());
  } catch {
    return NextResponse.json({ error: "Richiesta non valida (JSON malformato)." }, { status: 400 });
  }
  if (!Array.isArray(entries) || !entries.length) {
    return NextResponse.json({ error: "Lista membri mancante o vuota." }, { status: 400 });
  }

  try {
    const { count, notFound } = await applyRosterUpdate(entries);
    return NextResponse.json({ ok: true, count, notFound });
  } catch (err) {
    return NextResponse.json({ error: "Errore nell'aggiornamento del roster: " + String(err.message || err) }, { status: 500 });
  }
}
