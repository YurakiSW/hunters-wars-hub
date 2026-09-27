import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { listGuildDefenses, listGuildDefensesByTeam, searchGuildDefenseTeams, listBestDefensePerPlayer } from "../../../lib/guildDefenses";

// Quattro modalità, decise dal parametro presente:
// - nessuno: vista unificata per TEAM (tutti i giocatori sommati insieme)
// - ?owner=X: lista piatta delle difese di QUEL giocatore, senza raggruppare
// - ?team=X: solo i team che contengono il mostro cercato
// - ?bestPerPlayer=1: per ogni giocatore, solo la sua difesa col winrate migliore
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
    const defenses = await listBestDefensePerPlayer(allSieges);
    return NextResponse.json({ ok: true, mode: "bestPerPlayer", allSieges, defenses });
  }
  if (team) {
    const teams = await searchGuildDefenseTeams(team);
    return NextResponse.json({ ok: true, mode: "team", teams });
  }
  const teams = await listGuildDefensesByTeam();
  return NextResponse.json({ ok: true, mode: "team", teams });
}
