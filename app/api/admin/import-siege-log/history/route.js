import { NextResponse } from "next/server";
import { getCurrentUser, canManage } from "../../../../../lib/auth";
import { listLogImportHistory } from "../../../../../lib/siegeStats";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canManage(user)) {
    return NextResponse.json({ error: "Solo Admin e Revisori." }, { status: 403 });
  }
  const history = await listLogImportHistory();
  return NextResponse.json({ ok: true, history });
}
