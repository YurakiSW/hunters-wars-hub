import { NextResponse } from "next/server";
import { getCurrentUser, canManage } from "../../../../../lib/auth";
import { recordLogImport } from "../../../../../lib/siegeStats";
import { safeJson } from "../../../../../lib/apiUtils";

// Registra un import COMPLETO nella cronologia (Admin -> Diagnostica ->
// "Log già caricati"). Chiamata una volta sola dal client dopo che tutti i
// pezzi del file sono stati inviati con successo a /api/admin/import-siege-log
// -- il log viene spezzato in più richieste per stare sotto i limiti di
// Vercel, ma qui serve il file INTERO per calcolare l'impronta di contenuto
// (14/08/2026, Flora).
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !canManage(user)) {
    return NextResponse.json({ error: "Solo Admin e Revisori." }, { status: 403 });
  }
  const { data, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });
  const { logText, stats } = data;
  if (!logText || typeof logText !== "string") {
    return NextResponse.json({ error: "Manca il testo del log." }, { status: 400 });
  }
  const result = await recordLogImport({ logText, uploaderNickname: user.nickname, stats });
  return NextResponse.json({ ok: true, ...result });
}
