import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../../lib/auth";
import { fixCounterLeader } from "../../../../../lib/defs";
import { safeJson } from "../../../../../lib/apiUtils";

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo Admin." }, { status: 403 });
  }
  const { data } = await safeJson(request);
  if (!data?.counterId) return NextResponse.json({ error: "counterId mancante." }, { status: 400 });

  const result = await fixCounterLeader(data.counterId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
