import { NextResponse } from "next/server";
import { getCurrentUser, canManage } from "../../../../lib/auth";
import { deleteDef, deleteCounter } from "../../../../lib/defs";
import { safeJson } from "../../../../lib/apiUtils";

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !canManage(user)) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 403 });
  }
  const { data, error } = await safeJson(request);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const { defIds = [], counters = [] } = data; // counters: [{ defId, counterId }]

  await Promise.all(defIds.map((id) => deleteDef(id)));
  await Promise.all(counters.map(({ defId, counterId }) => deleteCounter(defId, counterId)));

  return NextResponse.json({ ok: true, deletedDefs: defIds.length, deletedCounters: counters.length });
}
