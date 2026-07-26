import { NextResponse } from "next/server";
import { getCurrentUser, canManage } from "../../../../lib/auth";
import { mergeDefs } from "../../../../lib/defs";
import { safeJson } from "../../../../lib/apiUtils";

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !canManage(user)) {
    return NextResponse.json({ error: "Solo Admin e Revisori possono unire le Difese." }, { status: 403 });
  }
  const { data, error } = await safeJson(request);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const { keepId, sourceIds } = data;
  if (!keepId || !Array.isArray(sourceIds) || !sourceIds.length) {
    return NextResponse.json({ error: "Serve keepId e almeno una Difesa sorgente da unire." }, { status: 400 });
  }
  const result = await mergeDefs(keepId, sourceIds);
  return NextResponse.json({ ok: true, ...result });
}
