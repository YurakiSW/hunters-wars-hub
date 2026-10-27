import { NextResponse } from "next/server";
import { getCurrentUser, canSeeSiegeForecast } from "../../../lib/auth";
import { loadForecastData, buildForecast } from "../../../lib/siegeForecast";

export const maxDuration = 30;

// Previsione di fine stagione. Solo Admin e Siege Leader.
// ?n=32 (soglia "top N": 32 = torneo, 10-100)  ?sieges=2 (siege rimanenti, per correggere il calcolo automatico)
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  if (!canSeeSiegeForecast(user)) return NextResponse.json({ error: "Solo Admin e Siege Leader." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const n = Math.max(10, Math.min(100, parseInt(searchParams.get("n"), 10) || 32));
  const sParam = searchParams.get("sieges");
  const siegesOverride = sParam !== null && sParam !== "" && Number.isInteger(Number(sParam)) ? Number(sParam) : null;

  const { snaps, season } = await loadForecastData();
  const forecast = buildForecast({ snaps, season, cutoff: n, siegesOverride });
  if (!forecast) return NextResponse.json({ ok: true, empty: true });
  return NextResponse.json({ ok: true, forecast });
}
