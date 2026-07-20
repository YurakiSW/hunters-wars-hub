import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { getDef, createCounter } from "../../../../../lib/defs";
import { isKnownMonster } from "../../../../../lib/monsters";
import { validateCounterPayload } from "../../../../../lib/gameData";

export async function POST(request, { params }) {
  const user = await getCurrentUser();
  if (!user || user.status !== "approved") {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }

  const def = await getDef(params.id);
  if (!def) return NextResponse.json({ error: "Difesa non trovata." }, { status: 404 });

  const payload = await request.json();

  const errors = validateCounterPayload(payload);
  if (errors.length) {
    return NextResponse.json({ error: "Campi mancanti o non validi: " + errors.join("; ") }, { status: 400 });
  }

  for (const u of payload.units) {
    if (!(await isKnownMonster(u.name))) {
      return NextResponse.json({ error: `"${u.name}" non è un mostro riconosciuto.` }, { status: 400 });
    }
  }
  for (const targetName of payload.focus) {
    if (!def.monsters.some((m) => m.toLowerCase() === targetName.toLowerCase())) {
      return NextResponse.json({ error: `"${targetName}" non è tra i mostri di questa Difesa.` }, { status: 400 });
    }
  }

  const counter = await createCounter(
    def.id,
    {
      offense: payload.units.map((u) => u.name),
      lead: payload.units.find((u) => u.lead)?.name || payload.units[0].name,
      turnOrder: payload.turnOrder,
      units: payload.units,
      focus: payload.focus,
      strategy: payload.strategy,
      warning: payload.warning,
      video: payload.video,
      images: payload.images,
    },
    { authorId: user.id, authorNickname: user.nickname, autoApprove: user.role === "admin" }
  );

  return NextResponse.json({ counter });
}
