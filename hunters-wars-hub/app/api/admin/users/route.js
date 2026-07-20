import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../lib/auth";
import { redis } from "../../../../lib/redis";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo l'Admin può vedere l'elenco utenti." }, { status: 403 });
  }
  const keys = await redis.keys("user:user_*");
  const users = keys.length ? await Promise.all(keys.map((k) => redis.get(k))) : [];
  // Non restituire MAI passwordHash al client.
  const safe = users.filter(Boolean).map(({ passwordHash, ...rest }) => rest);
  return NextResponse.json({ users: safe });
}
