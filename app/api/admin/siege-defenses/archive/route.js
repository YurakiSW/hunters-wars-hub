import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../../lib/auth";
import { archiveCurrentSeason, wipeAllLiveData } from "../../../../../lib/guildDefenses";
import { safeJson } from "../../../../../lib/apiUtils";

// Solo Admin: è un'azione che congela e svuota TUTTA la stagione corrente
// per l'intera gilda, non una scelta editoriale di tutti i giorni.
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo gli Admin possono archiviare/svuotare la stagione." }, { status: 403 });
  }
  const { data } = await safeJson(request).catch(() => ({ data: {} }));

  // Svuota tutto SENZA archiviare — per dati incompatibili con una
  // modifica al formato (es. il passaggio a ID grezzo del 04/08/2026),
  // dove non ha senso congelare in un archivio qualcosa di rotto.
  if (data?.wipeOnly) {
    try {
      const result = await wipeAllLiveData();
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      return NextResponse.json({ error: String(err.message || err) }, { status: 400 });
    }
  }

  try {
    const result = await archiveCurrentSeason(data?.siegeKeys);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 400 });
  }
}
