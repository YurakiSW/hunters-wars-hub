import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../../lib/auth";
import { archiveAndClearSeason, listSeasonArchives, listProposals } from "../../../../../lib/siegeStats";
import { safeJson } from "../../../../../lib/apiUtils";

// GET: scarica un backup (JSON) di tutte le proposal/statistiche vive,
// da tenere da parte PRIMA di premere "Fine Season" — come richiesto,
// separato dall'archiviazione automatica (che resta comunque consultabile
// con GET ?archives=1).
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo Admin." }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  if (searchParams.get("archives") === "1") {
    const archives = await listSeasonArchives();
    return NextResponse.json({ ok: true, archives });
  }
  // Backup "al volo": stesso contenuto che verrebbe archiviato, scaricabile
  // subito senza svuotare nulla.
  const proposals = await listProposals();
  return NextResponse.json({ exportedAt: new Date().toISOString(), proposals });
}

// POST: fine stagione — archivia tutto sotto seasonId e svuota le tabelle
// live (agg/variant/battle_seen/proposal). Le Difese/Counter già
// pubblicati NON vengono toccati.
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo Admin possono chiudere la stagione." }, { status: 403 });
  }
  const { data, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });
  const { seasonId } = data;

  try {
    const result = await archiveAndClearSeason(seasonId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 400 });
  }
}
