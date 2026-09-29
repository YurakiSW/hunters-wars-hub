import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { listGuildDefenses, listGuildDefensesByTeam, searchGuildDefenseTeams, listPlayerDefenseRanking } from "../../../lib/guildDefenses";

// La modalità "tutta la stagione" (allSieges=1) può dover leggere lo
// storico intero della gilda a blocchi (vedi loadAllBattlesByDefense in
// lib/guildDefenses.js) — serve più dei 10 secondi di default
// (27/09/2026, Flora).
export const maxDuration = 60;

// Quattro modalità, decise dal parametro presente:
// - nessuno: vista unificata per TEAM (tutti i giocatori sommati insieme)
// - ?owner=X: lista piatta delle difese di QUEL giocatore, senza raggruppare
// - ?team=X: solo i team che contengono il mostro cercato
// - ?bestPerPlayer=1: classifica giocatori per winrate in difesa, ognuno con tutte le sue squadre
//   (+ ?allSieges=1: ignora le siege incluse/escluse e conta l'intera
//   stagione mai caricata — sempre solo per questa modalità: le altre tre
//   restano legate alla selezione corrente, di proposito)
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const team = searchParams.get("team");
  const bestPerPlayer = searchParams.get("bestPerPlayer");
  const allSieges = searchParams.get("allSieges") === "1";

  if (owner) {
    const defenses = await listGuildDefenses(owner);
    return NextResponse.json({ ok: true, mode: "owner", defenses });
  }
  if (bestPerPlayer) {
    // Classifica dei giocatori per winrate in difesa, ciascuno con tutte le
    // sue squadre (lib/guildDefenses.js, listPlayerDefenseRanking).
    const ranking = await listPlayerDefenseRanking(allSieges); // { players, lowData, guildAvg, minBattles }
    return NextResponse.json({ ok: true, mode: "bestPerPlayer", allSieges, ...ranking });
  }
  if (team) {
    const teams = await searchGuildDefenseTeams(team);
    return NextResponse.json({ ok: true, mode: "team", teams });
  }
  const teams = await listGuildDefensesByTeam();
  return NextResponse.json({ ok: true, mode: "team", teams });
}
