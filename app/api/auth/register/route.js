import { NextResponse } from "next/server";
import { redis } from "../../../../lib/redis";
import { hashPassword, defaultRoleForGrade, defaultCanUploadRosterForGrade } from "../../../../lib/auth";
import { getRoster, findRosterEntry, normalizeNickname } from "../../../../lib/roster";
import { createSessionToken, SESSION_COOKIE } from "../../../../lib/session";
import { safeJson } from "../../../../lib/apiUtils";

const MAX_USERS = 35;

export async function POST(request) {
  const { data, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });
  const { email, password, nickname } = data;

  if (!email || !password || !nickname) {
    return NextResponse.json({ error: "Email, password e nickname sono obbligatori." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "La password deve avere almeno 8 caratteri." }, { status: 400 });
  }

  const emailKey = `user:byEmail:${email.trim().toLowerCase()}`;
  const existingId = await redis.get(emailKey);
  if (existingId) {
    return NextResponse.json({ error: "Esiste già un account con questa email." }, { status: 409 });
  }

  // Nota: KEYS è ok per una gilda (poche decine di utenti).
  const userKeys = await redis.keys("user:user_*");
  if (userKeys.length >= MAX_USERS) {
    return NextResponse.json({ error: `Limite di ${MAX_USERS} account raggiunto. Contatta un Admin.` }, { status: 403 });
  }

  // Se il nickname è già usato da un account esistente, non va mai
  // approvato in automatico (anche se combacia col roster): potrebbe
  // essere un doppione o un tentativo di impersonare qualcuno — resta in
  // coda "in attesa" finché un Admin non controlla a mano.
  const cleanNickname = normalizeNickname(nickname);
  let nicknameTaken = false;
  for (const key of userKeys) {
    const existing = await redis.get(key);
    if (existing && normalizeNickname(existing.nickname) === cleanNickname) {
      nicknameTaken = true;
      break;
    }
  }

  const roster = await getRoster();
  const match = findRosterEntry(roster, nickname);
  const autoApprove = Boolean(match) && !nicknameTaken;

  const id = `user_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const passwordHash = await hashPassword(password);

  const user = {
    id,
    email: email.trim().toLowerCase(),
    passwordHash,
    nickname: nickname.trim(),
    grade: match?.grade ?? null,
    status: autoApprove ? "approved" : "pending",
    role: autoApprove ? defaultRoleForGrade(match.grade) : "pending",
    manualRole: false,
    canUploadRoster: autoApprove ? defaultCanUploadRosterForGrade(match.grade) : false,
    manualPerm: false,
    createdAt: Date.now(),
  };

  await redis.set(`user:${id}`, user);
  await redis.set(emailKey, id);

  const token = await createSessionToken(id);
  const res = NextResponse.json({ ok: true, matchedRoster: autoApprove });
  res.cookies.set(SESSION_COOKIE.name, token, SESSION_COOKIE.options);
  return res;
}
