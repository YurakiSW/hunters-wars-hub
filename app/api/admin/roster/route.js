import { NextResponse } from "next/server";
import { getCurrentUser, defaultRoleForGrade, defaultCanUploadRosterForGrade, isAdmin } from "../../../../lib/auth";
import { getRoster, setRoster, extractRosterFromGameExport } from "../../../../lib/roster";
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

  const { rawJson } = await request.json();
  let entries;
  try {
    entries = extractRosterFromGameExport(rawJson);
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 400 });
  }

  await setRoster(entries);

  // Ricalcola ruolo/permesso di ogni utente esistente che combacia col nuovo
  // roster, MA solo se non è stato impostato a mano dall'Admin in precedenza.
  // Nota: KEYS è ok per una gilda (poche decine di utenti); se in futuro
  // servisse scalare molto di più, meglio mantenere un Set "user:ids" come
  // fatto per le Difese in lib/defs.js.
  const userIds = await redis.keys("user:user_*");
  for (const key of userIds) {
    const u = await redis.get(key);
    if (!u) continue;
    const match = entries.find((r) => (r.nickname || "").toLowerCase() === (u.nickname || "").toLowerCase());
    if (!match) continue;
    const patch = { grade: match.grade };
    if (u.status === "pending") patch.status = "approved";
    if (!u.manualRole) patch.role = defaultRoleForGrade(match.grade);
    if (!u.manualPerm) patch.canUploadRoster = defaultCanUploadRosterForGrade(match.grade);
    await redis.set(key, { ...u, ...patch });
  }

  return NextResponse.json({ ok: true, count: entries.length });
}
