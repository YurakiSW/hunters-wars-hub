import { NextResponse } from "next/server";
import { getCurrentUser, canManage } from "../../../../lib/auth";
import { setAliasesBulk, getAliases } from "../../../../lib/monsters";
import { safeJson } from "../../../../lib/apiUtils";

export async function GET() {
  const aliases = await getAliases();
  return NextResponse.json({ aliases });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !canManage(user)) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 403 });
  }
  const { data: entries, error } = await safeJson(request); // { "Nomignolo": "Nome Ufficiale", ... }
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (typeof entries !== "object" || Array.isArray(entries)) {
    return NextResponse.json({ error: "Formato non valido: serve un oggetto { \"nomignolo\": \"nome ufficiale\" }." }, { status: 400 });
  }
  const aliases = await setAliasesBulk(entries);
  return NextResponse.json({ ok: true, count: Object.keys(entries).length, total: Object.keys(aliases).length });
}
