import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin, defaultRoleForGrade, defaultCanUploadRosterForGrade } from "../../../../../lib/auth";
import { getRoster, normalizeNickname } from "../../../../../lib/roster";
import { redis } from "../../../../../lib/redis";
import { safeJson } from "../../../../../lib/apiUtils";

// Associa un account "non trovato" (probabile cambio nickname in gioco) al
// suo nuovo nome nel roster — invece di doverlo eliminare e perdere tutto
// (ruolo, permessi, autore delle Difese/Counter già creati).
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo Admin possono associare un account a un nuovo nickname." }, { status: 403 });
  }

  const { data, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });
  const { userId, newNickname } = data;
  if (!userId || !newNickname) {
    return NextResponse.json({ error: "Parametri mancanti." }, { status: 400 });
  }

  const roster = await getRoster();
  const match = roster.find((r) => normalizeNickname(r.nickname) === normalizeNickname(newNickname));
  if (!match) {
    return NextResponse.json({ error: "Quel nickname non è (più) nel roster attuale." }, { status: 400 });
  }

  const key = `user:${userId}`;
  const u = await redis.get(key);
  if (!u) return NextResponse.json({ error: "Account non trovato." }, { status: 404 });

  // Evita di associare due account allo stesso nickname per errore.
  const allKeys = await redis.keys("user:user_*");
  for (const otherKey of allKeys) {
    if (otherKey === key) continue;
    const other = await redis.get(otherKey);
    if (other && normalizeNickname(other.nickname) === normalizeNickname(newNickname)) {
      return NextResponse.json({ error: `"${match.nickname}" è già associato a un altro account (${other.nickname}).` }, { status: 400 });
    }
  }

  const patch = { nickname: match.nickname, grade: match.grade };
  if (!u.manualRole) patch.role = defaultRoleForGrade(match.grade);
  if (!u.manualPerm) patch.canUploadRoster = defaultCanUploadRosterForGrade(match.grade);
  await redis.set(key, { ...u, ...patch });

  // Toglie dalla lista di revisione solo questo, gli altri restano.
  const remaining = ((await redis.get("roster:removal_candidates")) || []).filter((c) => c.id !== userId);
  await redis.set("roster:removal_candidates", remaining);

  return NextResponse.json({ ok: true, nickname: match.nickname });
}
