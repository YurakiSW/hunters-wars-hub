import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../../lib/auth";
import { redis } from "../../../../../lib/redis";
import { safeJson } from "../../../../../lib/apiUtils";

// Elimina SOLO gli account che l'Admin ha scelto uno per uno dalla lista
// "non trovati nel roster" — mai in automatico. Le Difese/Counter creati
// da questi utenti restano intatte (l'autore ci resta scritto come testo).
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo Admin possono confermare l'eliminazione di un account." }, { status: 403 });
  }

  const { data, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });
  const { userIds } = data;
  if (!Array.isArray(userIds) || !userIds.length) {
    return NextResponse.json({ error: "Nessun account selezionato." }, { status: 400 });
  }

  let removed = 0;
  for (const id of userIds) {
    const key = `user:${id}`;
    const u = await redis.get(key);
    if (!u || u.role === "admin") continue; // l'Admin non si elimina mai da qui
    await redis.del(key);
    if (u.email) await redis.del(`user:byEmail:${u.email.toLowerCase()}`);
    removed++;
  }

  // Toglie dalla lista di revisione solo quelli appena eliminati — chi
  // resta (non selezionato) rimane visibile per una decisione successiva.
  const remaining = ((await redis.get("roster:removal_candidates")) || []).filter((c) => !userIds.includes(c.id));
  await redis.set("roster:removal_candidates", remaining);

  return NextResponse.json({ ok: true, removed, remaining });
}
