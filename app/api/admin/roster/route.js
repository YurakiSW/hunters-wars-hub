import { NextResponse } from "next/server";
import { getCurrentUser, defaultRoleForGrade, defaultCanUploadRosterForGrade, isAdmin } from "../../../../lib/auth";
import { getRoster, setRoster, normalizeNickname } from "../../../../lib/roster";
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
    await setRoster(entries);

    // Ricalcola ruolo/permesso di ogni utente esistente che combacia col nuovo
    // roster, MA solo se non è stato impostato a mano dall'Admin in precedenza.
    // Nota: KEYS è ok per una gilda (poche decine di utenti); se in futuro
    // servisse scalare molto di più, meglio mantenere un Set "user:ids" come
    // fatto per le Difese in lib/defs.js.
    const userIds = await redis.keys("user:user_*");
    const notFound = [];
    for (const key of userIds) {
      const u = await redis.get(key);
      if (!u) continue;
      const match = entries.find((r) => normalizeNickname(r.nickname) === normalizeNickname(u.nickname));

      if (!match) {
        // Non combacia col roster appena caricato — MA non significa per
        // forza che abbia lasciato la gilda: può aver semplicemente
        // cambiato nickname in gioco. Non si elimina più in automatico:
        // finisce in una lista di revisione che l'Admin conferma a mano
        // (vedi POST /api/admin/roster/remove-members).
        if (u.role !== "admin") {
          notFound.push({ id: u.id, nickname: u.nickname, email: u.email || null, grade: u.grade, role: u.role });
        }
        continue;
      }

      const patch = { grade: match.grade };
      if (u.status === "pending") patch.status = "approved";
      if (!u.manualRole) patch.role = defaultRoleForGrade(match.grade);
      if (!u.manualPerm) patch.canUploadRoster = defaultCanUploadRosterForGrade(match.grade);
      await redis.set(key, { ...u, ...patch });
    }

    // Sovrascrive la lista di revisione con quella appena calcolata (riflette
    // sempre lo stato ATTUALE roster-vs-sito, non si accumula tra un upload
    // e l'altro).
    await redis.set("roster:removal_candidates", notFound);

    return NextResponse.json({ ok: true, count: entries.length, notFound });
  } catch (err) {
    return NextResponse.json({ error: "Errore nell'aggiornamento del roster: " + String(err.message || err) }, { status: 500 });
  }
}
