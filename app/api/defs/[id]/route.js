import { NextResponse } from "next/server";
import { getCurrentUser, canManage } from "../../../../lib/auth";
import { getDef, updateDef, deleteDef } from "../../../../lib/defs";
import { isKnownMonster } from "../../../../lib/monsters";
import { safeJson } from "../../../../lib/apiUtils";

export async function GET(request, { params }) {
  const user = await getCurrentUser();
  if (!user || user.status !== "approved") return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  const def = await getDef(params.id);
  if (!def) return NextResponse.json({ error: "Non trovata." }, { status: 404 });
  def.counters = def.counters.filter((c) => c.status === "approved" || canManage(user) || c.authorId === user.id);
  return NextResponse.json({ def });
}

export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!user || !canManage(user)) {
    return NextResponse.json({ error: "Solo Admin e Revisori possono modificare una Difesa." }, { status: 403 });
  }
  const { data, error } = await safeJson(request);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const { m1, m2, m3, desc } = data;
  const monsters = [m1, m2, m3];
  for (const m of monsters) {
    if (!(await isKnownMonster(m))) {
      return NextResponse.json({ error: `"${m}" non è un mostro riconosciuto.` }, { status: 400 });
    }
  }
  // La modifica rimanda la Difesa in coda "in attesa" per una nuova approvazione.
  const def = await updateDef(params.id, { monsters, desc, status: "pending" });
  if (!def) return NextResponse.json({ error: "Non trovata." }, { status: 404 });
  return NextResponse.json({ def });
}

export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!user || !canManage(user)) {
    return NextResponse.json({ error: "Solo Admin e Revisori possono eliminare una Difesa." }, { status: 403 });
  }
  await deleteDef(params.id);
  return NextResponse.json({ ok: true });
}

// Approvazione/rifiuto rapido (usato dai bottoni Approva/Rifiuta sui Counter,
// riusa lo stesso schema anche per la Difesa) + toggle "pinnata in cima"
export async function PUT(request, { params }) {
  const user = await getCurrentUser();
  if (!user || !canManage(user)) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 403 });
  }
  const { data, error } = await safeJson(request);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const { status, pinned } = data;
  const patch = {};
  if (status !== undefined) {
    if (!["approved", "pending"].includes(status)) {
      return NextResponse.json({ error: "Stato non valido." }, { status: 400 });
    }
    patch.status = status;
  }
  if (typeof pinned === "boolean") patch.pinned = pinned;
  const def = await updateDef(params.id, patch);
  return NextResponse.json({ def });
}
