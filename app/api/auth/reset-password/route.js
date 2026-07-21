import { NextResponse } from "next/server";
import { redis } from "../../../../lib/redis";
import { hashPassword } from "../../../../lib/auth";
import { consumePasswordResetToken } from "../../../../lib/passwordReset";
import { safeJson } from "../../../../lib/apiUtils";

export async function POST(request) {
  const { data, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });
  const { token, password } = data;

  if (!token || !password) {
    return NextResponse.json({ error: "Token e nuova password sono obbligatori." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "La password deve avere almeno 8 caratteri." }, { status: 400 });
  }

  const userId = await consumePasswordResetToken(token);
  if (!userId) {
    return NextResponse.json({ error: "Link scaduto o non valido. Richiedine uno nuovo." }, { status: 400 });
  }

  const user = await redis.get(`user:${userId}`);
  if (!user) return NextResponse.json({ error: "Utente non trovato." }, { status: 404 });

  const passwordHash = await hashPassword(password);
  await redis.set(`user:${userId}`, { ...user, passwordHash });

  return NextResponse.json({ ok: true });
}
