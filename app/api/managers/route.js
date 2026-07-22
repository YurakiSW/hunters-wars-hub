import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { redis } from "../../../lib/redis";

// Elenco leggero (solo nickname) di chi ha ruolo Admin o Revisore Counters
// ADESSO — usato per mettere le stelline ✦ accanto al nome ovunque compaia
// come autore di una Difesa/Counter. Nessun dato sensibile: niente email,
// niente password, solo il nickname pubblico.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });

  const keys = await redis.keys("user:user_*");
  const users = keys.length ? (await Promise.all(keys.map((k) => redis.get(k)))).filter(Boolean) : [];
  const nicknames = users.filter((u) => u.role === "admin" || u.role === "reviewer").map((u) => u.nickname);

  return NextResponse.json({ nicknames });
}
