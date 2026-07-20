import { NextResponse } from "next/server";
import { getCurrentUser, canManage } from "../../../../lib/auth";
import { deleteDef, deleteCounter } from "../../../../lib/defs";

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !canManage(user)) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 403 });
  }
  const { defIds = [], counters = [] } = await request.json(); // counters: [{ defId, counterId }]

  await Promise.all(defIds.map((id) => deleteDef(id)));
  await Promise.all(counters.map(({ defId, counterId }) => deleteCounter(defId, counterId)));

  return NextResponse.json({ ok: true, deletedDefs: defIds.length, deletedCounters: counters.length });
}
