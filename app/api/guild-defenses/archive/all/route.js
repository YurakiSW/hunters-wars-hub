import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../../lib/auth";
import { deleteAllSeasonArchives } from "../../../../../lib/guildDefenses";

// Svuota TUTTE le stagioni archiviate in un colpo solo — separata dalla
// eliminazione di una singola stagione, che resta in
// /api/guild-defenses/archive/[archiveId].
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo gli Admin possono svuotare l'archivio." }, { status: 403 });
  }
  const result = await deleteAllSeasonArchives();
  return NextResponse.json({ ok: true, ...result });
}
