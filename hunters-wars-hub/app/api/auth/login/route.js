import { NextResponse } from "next/server";
import { redis } from "../../../../lib/redis";
import { verifyPassword } from "../../../../lib/auth";
import { createSessionToken, SESSION_COOKIE } from "../../../../lib/session";

export async function POST(request) {
  const { email, password } = await request.json();
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

  const token = await createSessionToken(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE.name, token, SESSION_COOKIE.options);
  return res;
}
