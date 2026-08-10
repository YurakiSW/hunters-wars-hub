import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../../lib/auth";
import { getNeverCleanIds } from "../../../../../lib/monsters";

// Sola lettura — mostra la lista DINAMICA (quella aggiunta da Admin nel
// tempo, salvata su Redis). Non include lo storico Ifrit scritto a mano
// nel codice (NEVER_CLEAN_NAME_IDS_SEED in sync/route.js), quello è fisso
// e non serve vederlo/toccarlo qui.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo Admin." }, { status: 403 });
  }
  const ids = await getNeverCleanIds();
  return NextResponse.json({ ok: true, ids });
}
