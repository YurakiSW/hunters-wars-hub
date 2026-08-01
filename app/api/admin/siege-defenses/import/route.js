import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../../lib/auth";
import { importSiegeDefenseLog } from "../../../../../lib/guildDefenses";
import { safeJson } from "../../../../../lib/apiUtils";

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo Admin possono importare i log Difese Gilda." }, { status: 403 });
  }
  const { data, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });
  if (!data.logText?.trim()) return NextResponse.json({ error: "Nessun testo di log incollato." }, { status: 400 });

  try {
    const result = await importSiegeDefenseLog(data.logText);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: `Import fallito: ${String(err.message || err)}` }, { status: 500 });
  }
}
