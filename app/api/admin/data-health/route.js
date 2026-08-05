import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../lib/auth";
import { listDefs, counterHasBuildInfo } from "../../../../lib/defs";

// Riepilogo veloce di "cose che potrebbero essere state dimenticate" — non
// modifica nulla, solo conta. Nato il 05/08/2026 (Flora) dopo essere
// inciampata per caso in una Difesa senza counter e in un counter senza
// leader mai segnato: meglio un numero da controllare ogni tanto che
// scoprirle a caso una alla volta.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo Admin." }, { status: 403 });
  }
  const defs = await listDefs();

  const defsWithoutCounters = [];
  const countersWithoutLead = [];
  const countersWithoutBuild = [];

  for (const d of defs) {
    const counters = d.counters || [];
    if (counters.length === 0) {
      defsWithoutCounters.push({ defId: d.id, monsters: d.monsters });
      continue;
    }
    for (const c of counters) {
      if (c.status !== "approved") continue; // solo quelli già live hanno senso da controllare qui
      if (!c.units?.some((u) => u.lead)) {
        countersWithoutLead.push({ defId: d.id, counterId: c.id, defense: d.monsters, offense: c.offense });
      }
      if (!counterHasBuildInfo(c)) {
        countersWithoutBuild.push({ defId: d.id, counterId: c.id, defense: d.monsters, offense: c.offense });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    defsWithoutCounters,
    countersWithoutLead,
    countersWithoutBuild,
  });
}
