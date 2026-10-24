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
  const present = users.filter(Boolean);
  // 24/10/2026 (Flora): serve vedere con che email si è registrato ognuno. In
  // più si controlla che l'email sia davvero "agganciata" all'account (stesso
  // indice che usano login e recupero password): se non lo è, per quell'account
  // il recupero password non può funzionare, e l'Admin lo vede subito.
  const withEmail = present.filter((u) => u.email);
  const indexed = withEmail.length
    ? await redis.mget(...withEmail.map((u) => `user:byEmail:${u.email.trim().toLowerCase()}`))
    : [];
  const emailLookupOk = new Map(withEmail.map((u, i) => [u.id, indexed[i] === u.id]));
  // Non restituire MAI passwordHash al client.
  const safe = present.map(({ passwordHash, ...rest }) => ({
    ...rest,
    emailLookupOk: rest.email ? emailLookupOk.get(rest.id) === true : null,
  }));
  return NextResponse.json({ users: safe });
}
