import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { getTeamDetail } from "../../../../../lib/guildDefenses";

export async function GET(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  const detail = await getTeamDetail(decodeURIComponent(params.teamKey));
  if (!detail) return NextResponse.json({ error: "Team non trovato." }, { status: 404 });
  return NextResponse.json({ ok: true, detail });
}
