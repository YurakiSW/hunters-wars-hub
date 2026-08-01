import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { listGuildDefenses, listGuildDefensesByTeam, searchGuildDefenseTeams } from "../../../lib/guildDefenses";

// Tre modalità, decise dal parametro presente:
// - nessuno: vista unificata per TEAM (tutti i giocatori sommati insieme)
// - ?owner=X: lista piatta delle difese di QUEL giocatore, senza raggruppare
// - ?team=X: solo i team che contengono il mostro cercato
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const team = searchParams.get("team");

  if (owner) {
    const defenses = await listGuildDefenses(owner);
    return NextResponse.json({ ok: true, mode: "owner", defenses });
  }
  if (team) {
    const teams = await searchGuildDefenseTeams(team);
    return NextResponse.json({ ok: true, mode: "team", teams });
  }
  const teams = await listGuildDefensesByTeam();
  return NextResponse.json({ ok: true, mode: "team", teams });
}
