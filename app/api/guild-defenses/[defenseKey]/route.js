import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { getGuildDefenseDetail } from "../../../../lib/guildDefenses";

export async function GET(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  const detail = await getGuildDefenseDetail(decodeURIComponent(params.defenseKey));
  if (!detail) return NextResponse.json({ error: "Difesa non trovata." }, { status: 404 });
  return NextResponse.json({ ok: true, detail });
}
