import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../lib/auth";
import { renameSiegeLogAuthors, findDuplicateCounters, cleanupDuplicateCounters, simplifySiegeLogDescriptions } from "../../../../lib/defs";
import { resyncApprovedCounters } from "../../../../lib/siegeStats";
import { safeJson } from "../../../../lib/apiUtils";

// GET: mostra quanti doppioni ci sono ora, senza cancellare nulla — utile
// per controllare prima di premere il pulsante di pulizia vera.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo Admin." }, { status: 403 });
  }
  const dupGroups = await findDuplicateCounters();
  return NextResponse.json({
    ok: true,
    duplicateGroups: dupGroups.length,
    duplicateExtra: dupGroups.reduce((sum, g) => sum + g.length - 1, 0),
  });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo Admin." }, { status: 403 });
  }
  const { data, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });

  if (data.action === "rename_siege_log_authors") {
    const result = await renameSiegeLogAuthors();
    return NextResponse.json({ ok: true, ...result });
  }
  if (data.action === "cleanup_duplicates") {
    const result = await cleanupDuplicateCounters();
    return NextResponse.json({ ok: true, ...result });
  }
  if (data.action === "resync_from_variants") {
    const result = await resyncApprovedCounters();
    return NextResponse.json({ ok: true, ...result });
  }
  if (data.action === "simplify_descriptions") {
    const result = await simplifySiegeLogDescriptions();
    return NextResponse.json({ ok: true, ...result });
  }
  return NextResponse.json({ error: "Azione non valida." }, { status: 400 });
}
