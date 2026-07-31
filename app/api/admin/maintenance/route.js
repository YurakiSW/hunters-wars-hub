import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../lib/auth";
import { findDuplicateCounters, cleanupDuplicateCounters } from "../../../../lib/defs";
import { resyncApprovedCounters, backfillLogOwnerNicknames } from "../../../../lib/siegeStats";
import { syncMonstersFromSwarfarm } from "../../monsters/sync/route";
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

  if (data.action === "cleanup_duplicates") {
    const result = await cleanupDuplicateCounters();
    return NextResponse.json({ ok: true, ...result });
  }
  if (data.action === "resync_from_variants") {
    const result = await resyncApprovedCounters();
    return NextResponse.json({ ok: true, ...result });
  }
  if (data.action === "sync_monsters") {
    try {
      const result = await syncMonstersFromSwarfarm();
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      return NextResponse.json({ error: `Sincronizzazione fallita: ${String(err.message || err)}` }, { status: 502 });
    }
  }
  if (data.action === "backfill_log_nicknames") {
    const result = await backfillLogOwnerNicknames();
    return NextResponse.json({ ok: true, ...result });
  }
  return NextResponse.json({ error: "Azione non valida." }, { status: 400 });
}
