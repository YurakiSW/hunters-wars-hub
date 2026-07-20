import { NextResponse } from "next/server";
import { redis } from "../../../../lib/redis";
import { hashPassword, defaultRoleForGrade, defaultCanUploadRosterForGrade } from "../../../../lib/auth";
import { getRoster, findRosterEntry } from "../../../../lib/roster";
import { createSessionToken, SESSION_COOKIE } from "../../../../lib/session";

export async function POST(request) {
  const { email, password, nickname } = await request.json();

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

  const roster = await getRoster();
  const match = findRosterEntry(roster, nickname);

  const id = `user_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const passwordHash = await hashPassword(password);

  const user = {
    id,
    email: email.trim().toLowerCase(),
    passwordHash,
    nickname: nickname.trim(),
    grade: match?.grade ?? null,
    status: match ? "approved" : "pending", // "pending" = in attesa di revisione manuale se il nickname non combacia col roster
    role: match ? defaultRoleForGrade(match.grade) : "pending",
    manualRole: false,
    canUploadRoster: match ? defaultCanUploadRosterForGrade(match.grade) : false,
    manualPerm: false,
    createdAt: Date.now(),
  };

  await redis.set(`user:${id}`, user);
  await redis.set(emailKey, id);

  const token = await createSessionToken(id);
  const res = NextResponse.json({ ok: true, matchedRoster: Boolean(match) });
  res.cookies.set(SESSION_COOKIE.name, token, SESSION_COOKIE.options);
  return res;
}
