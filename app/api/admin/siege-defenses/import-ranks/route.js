import { NextResponse } from "next/server";
import { getCurrentUser, canManage } from "../../../../../lib/auth";
import { importGuildRanksFromLog } from "../../../../../lib/guildDefenses";
import { safeJson } from "../../../../../lib/apiUtils";

// Route TEMPORANEA (29/09/2026, Flora): recupera il piazzamento (1st/2nd/3rd)
// per le siege importate PRIMA che il codice lo leggesse, da log già
// caricati per i counter (stesso comando GetGuildSiegeBattleLog contiene
// sia le battaglie sia il piazzamento). Da rimuovere una volta recuperato
// lo storico — da lì in poi il piazzamento arriva da solo con l'import
// normale delle difese (/api/admin/siege-defenses, action "import").
export const maxDuration = 60;

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !canManage(user)) {
    return NextResponse.json({ error: "Solo Admin e Revisori." }, { status: 403 });
  }
  const { data, error } = await safeJson(request);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const { logText } = data;
  if (!logText || typeof logText !== "string") {
    return NextResponse.json({ error: "Manca il testo del log." }, { status: 400 });
  }
  const result = await importGuildRanksFromLog(logText);
  return NextResponse.json({ ok: true, ...result });
}
