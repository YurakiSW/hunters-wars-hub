import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { listGuildDefenses } from "../../../lib/guildDefenses";

export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const defenses = await listGuildDefenses(q);
  return NextResponse.json({ ok: true, defenses });
}
