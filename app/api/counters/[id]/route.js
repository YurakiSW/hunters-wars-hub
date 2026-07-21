import { NextResponse } from "next/server";
import { getCurrentUser, canManage } from "../../../../lib/auth";
import { getCounter, updateCounter, deleteCounter, getDef } from "../../../../lib/defs";
import { isKnownMonster } from "../../../../lib/monsters";
import { validateCounterPayload } from "../../../../lib/gameData";
import { safeJson } from "../../../../lib/apiUtils";

function canEdit(user, counter) {
  if (canManage(user)) return true;
  return counter.authorId === user.id && counter.status === "pending";
}

export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!user || user.status !== "approved") return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });

  const counter = await getCounter(params.id);
  if (!counter) return NextResponse.json({ error: "Non trovato." }, { status: 404 });
  if (!canEdit(user, counter)) return NextResponse.json({ error: "Non puoi modificare questo counter." }, { status: 403 });

  const { data: payload, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });

  // Solo Admin/Revisore possono cambiare lo stato (approva/rifiuta) tramite questo campo;
  // qualsiasi altra modifica riporta comunque il counter in "pending".
  if (payload.status && !canManage(user)) {
    delete payload.status;
  }

  if (payload.units) {
    const errors = validateCounterPayload(payload);
    if (errors.length) {
      return NextResponse.json({ error: "Campi mancanti o non validi: " + errors.join("; ") }, { status: 400 });
    }
    for (const u of payload.units) {
      if (!(await isKnownMonster(u.name))) {
        return NextResponse.json({ error: `"${u.name}" non è un mostro riconosciuto.` }, { status: 400 });
      }
    }
    const def = await getDef(counter.defId);
    for (const targetName of payload.focus) {
      if (!def.monsters.some((m) => m.toLowerCase() === targetName.toLowerCase())) {
        return NextResponse.json({ error: `"${targetName}" non è tra i mostri di questa Difesa.` }, { status: 400 });
      }
    }
    payload.offense = payload.units.map((u) => u.name);
    payload.lead = payload.units.find((u) => u.lead)?.name || payload.units[0].name;
    if (!payload.status) payload.status = "pending";
  }

  const updated = await updateCounter(params.id, payload);
  return NextResponse.json({ counter: updated });
}

export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!user || !canManage(user)) {
    return NextResponse.json({ error: "Solo Admin e Revisori possono eliminare un counter." }, { status: 403 });
  }
  const counter = await getCounter(params.id);
  if (!counter) return NextResponse.json({ error: "Non trovato." }, { status: 404 });
  await deleteCounter(counter.defId, params.id);
  return NextResponse.json({ ok: true });
}
