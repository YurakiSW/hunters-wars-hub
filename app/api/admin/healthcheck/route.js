import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../lib/auth";
import { redis } from "../../../../lib/redis";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo l'Admin può vedere questa pagina." }, { status: 403 });
  }

  const checks = [];

  // Variabili d'ambiente presenti (non ne mostriamo mai il valore, solo se ci sono)
  const envVars = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "SESSION_SECRET", "CRON_SECRET", "RESEND_API_KEY"];
  for (const name of envVars) {
    checks.push({ name: `Variabile ${name}`, ok: Boolean(process.env[name]), detail: process.env[name] ? "presente" : "MANCANTE" });
  }

  // Upstash Redis raggiungibile
  try {
    await redis.set("healthcheck:ping", Date.now());
    const val = await redis.get("healthcheck:ping");
    checks.push({ name: "Connessione a Upstash Redis", ok: Boolean(val), detail: val ? "risponde" : "nessuna risposta" });
  } catch (err) {
    checks.push({ name: "Connessione a Upstash Redis", ok: false, detail: String(err.message || err) });
  }

  // Quanti mostri sincronizzati ci sono (per capire se la sync è mai stata lanciata)
  try {
    const synced = (await redis.get("monsters:synced")) || [];
    checks.push({ name: "Mostri sincronizzati da swarfarm", ok: synced.length > 0, detail: `${synced.length} mostri` });
  } catch {
    checks.push({ name: "Mostri sincronizzati da swarfarm", ok: false, detail: "errore lettura" });
  }

  // Roster caricato
  try {
    const roster = (await redis.get("guild:roster")) || [];
    checks.push({ name: "Roster gilda caricato", ok: roster.length > 0, detail: `${roster.length} membri` });
  } catch {
    checks.push({ name: "Roster gilda caricato", ok: false, detail: "errore lettura" });
  }

  return NextResponse.json({ checks });
}
