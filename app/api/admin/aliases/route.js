import { NextResponse } from "next/server";
import { getCurrentUser, canManage } from "../../../../lib/auth";
import { setAliasesBulk, getAliases } from "../../../../lib/monsters";

export async function GET() {
  const aliases = await getAliases();
  return NextResponse.json({ aliases });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !canManage(user)) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 403 });
  }
  const entries = await request.json(); // { "Nomignolo": "Nome Ufficiale", ... }
  if (typeof entries !== "object" || Array.isArray(entries)) {
    return NextResponse.json({ error: "Formato non valido: serve un oggetto { \"nomignolo\": \"nome ufficiale\" }." }, { status: 400 });
  }
  const aliases = await setAliasesBulk(entries);
  return NextResponse.json({ ok: true, count: Object.keys(entries).length, total: Object.keys(aliases).length });
}
