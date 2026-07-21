import { NextResponse } from "next/server";
import { getCurrentUser, defaultRoleForGrade, defaultCanUploadRosterForGrade, isAdmin } from "../../../../lib/auth";
import { getRoster, setRoster, normalizeNickname } from "../../../../lib/roster";
import { redis } from "../../../../lib/redis";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  const roster = await getRoster();
  return NextResponse.json({ roster });
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
  const { entries } = await request.json();
  if (!Array.isArray(entries) || !entries.length) {
    return NextResponse.json({ error: "Lista membri mancante o vuota." }, { status: 400 });
  }

  await setRoster(entries);

  // Ricalcola ruolo/permesso di ogni utente esistente che combacia col nuovo
  // roster, MA solo se non è stato impostato a mano dall'Admin in precedenza.
  // Nota: KEYS è ok per una gilda (poche decine di utenti); se in futuro
  // servisse scalare molto di più, meglio mantenere un Set "user:ids" come
  // fatto per le Difese in lib/defs.js.
  const userIds = await redis.keys("user:user_*");
  let removed = 0;
  for (const key of userIds) {
    const u = await redis.get(key);
    if (!u) continue;
    const match = entries.find((r) => normalizeNickname(r.nickname) === normalizeNickname(u.nickname));

    if (!match) {
      // Non è più nel roster: ha lasciato la gilda. L'account viene
      // rimosso (mai quello dell'Admin, per sicurezza — se un file caricato
      // per sbaglio fosse incompleto, non si perde l'accesso al pannello).
      // Le Difese/Counter che ha creato restano intatte: l'autore ci resta
      // scritto sopra come testo, non dipende dall'account che esiste ancora.
      if (u.role !== "admin") {
        await redis.del(key);
        if (u.email) await redis.del(`user:byEmail:${u.email.toLowerCase()}`);
        removed++;
      }
      continue;
    }

    const patch = { grade: match.grade };
    if (u.status === "pending") patch.status = "approved";
    if (!u.manualRole) patch.role = defaultRoleForGrade(match.grade);
    if (!u.manualPerm) patch.canUploadRoster = defaultCanUploadRosterForGrade(match.grade);
    await redis.set(key, { ...u, ...patch });
  }

  return NextResponse.json({ ok: true, count: entries.length, removed });
}
