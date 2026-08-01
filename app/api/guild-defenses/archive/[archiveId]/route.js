import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../../lib/auth";
import { getSeasonArchive, deleteSeasonArchive } from "../../../../../lib/guildDefenses";

export async function GET(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  const archive = await getSeasonArchive(params.archiveId);
  if (!archive) return NextResponse.json({ error: "Stagione non trovata." }, { status: 404 });
  return NextResponse.json({ ok: true, archive });
}

export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo gli Admin possono eliminare una stagione archiviata." }, { status: 403 });
  }
  await deleteSeasonArchive(params.archiveId);
  return NextResponse.json({ ok: true });
}
