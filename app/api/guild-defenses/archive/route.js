import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { listSeasonArchives } from "../../../../lib/guildDefenses";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  const archives = await listSeasonArchives();
  return NextResponse.json({ ok: true, archives });
}
