import { NextResponse } from "next/server";
import { redis } from "../../../../lib/redis";
import { createPasswordResetToken } from "../../../../lib/passwordReset";
import { sendPasswordResetEmail } from "../../../../lib/email";
import { safeJson } from "../../../../lib/apiUtils";

export async function POST(request) {
  const { data, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });
  const { email } = data;
  if (!email) return NextResponse.json({ error: "Email obbligatoria." }, { status: 400 });

  // Risposta identica sia che l'email esista o no: altrimenti chiunque
  // potrebbe scoprire quali email sono registrate provando a caso.
  const userId = await redis.get(`user:byEmail:${email.trim().toLowerCase()}`);
  if (userId) {
    const user = await redis.get(`user:${userId}`);
    if (user) {
      const token = await createPasswordResetToken(userId);
      sendPasswordResetEmail(user, token).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
