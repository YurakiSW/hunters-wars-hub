import { NextResponse } from "next/server";
import { getCurrentUser, canSeeSiegeForecast } from "../../../lib/auth";
import { loadForecastData, buildForecast, listArchivedSeasons, getArchivedSeason } from "../../../lib/siegeForecast";

export const maxDuration = 30;

// Previsione di fine stagione. Solo Admin e Siege Leader.
// ?archive=list | ?archive=<idStagione>  (stagioni concluse, archiviate da sole)
// ?n=32 (soglia "top N": 32 = torneo, 10-100)  ?sieges=2 (siege rimanenti, per correggere il calcolo automatico)
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  if (!canSeeSiegeForecast(user)) return NextResponse.json({ error: "Accesso non consentito." }, { status: 403 });

  const { searchParams } = new URL(request.url);

  // ?archive=list -> stagioni concluse; ?archive=<id> -> classifica finale di una stagione
  const archive = searchParams.get("archive");
  if (archive) {
    if (archive === "list") return NextResponse.json({ ok: true, seasons: await listArchivedSeasons() });
    const id = parseInt(archive, 10);
    const detail = Number.isInteger(id) ? await getArchivedSeason(id) : null;
    if (!detail) return NextResponse.json({ error: "Stagione non trovata." }, { status: 404 });
    return NextResponse.json({ ok: true, season: detail });
  }
  const n = Math.max(10, Math.min(100, parseInt(searchParams.get("n"), 10) || 32));
  const sParam = searchParams.get("sieges");
  const siegesOverride = sParam !== null && sParam !== "" && Number.isInteger(Number(sParam)) ? Number(sParam) : null;

  const { snaps, season, poolSeqs } = await loadForecastData();
  const forecast = buildForecast({ snaps, poolSeqs, season, cutoff: n, siegesOverride });
  if (!forecast) return NextResponse.json({ ok: true, empty: true });
  return NextResponse.json({ ok: true, forecast });
}
