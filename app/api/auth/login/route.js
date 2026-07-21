import { NextResponse } from "next/server";
import { redis } from "../../../../lib/redis";
import { verifyPassword } from "../../../../lib/auth";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "../../../../lib/session";
import { safeJson } from "../../../../lib/apiUtils";

export async function POST(request) {
  const { data, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });
  const { email, password, keepSignedIn = true } = data;
  if (!email || !password) {
    return NextResponse.json({ error: "Email e password sono obbligatorie." }, { status: 400 });
  }

  const userId = await redis.get(`user:byEmail:${email.trim().toLowerCase()}`);
  if (!userId) {
    return NextResponse.json({ error: "Email o password non corretti." }, { status: 401 });
  }
  const user = await redis.get(`user:${userId}`);
  if (!user) {
    return NextResponse.json({ error: "Email o password non corretti." }, { status: 401 });
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Email o password non corretti." }, { status: 401 });
  }

  const token = await createSessionToken(user.id, keepSignedIn);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE.name, token, sessionCookieOptions(keepSignedIn));
  return res;
}
