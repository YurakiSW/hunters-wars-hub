import { NextResponse } from "next/server";
import { getCurrentUser, canManage } from "../../../lib/auth";
import { listDefs, createDef } from "../../../lib/defs";
import { isKnownMonster } from "../../../lib/monsters";
import { safeJson } from "../../../lib/apiUtils";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.status !== "approved") {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }
  const defs = await listDefs();
  // Filtra i counter "in attesa" a chi non gestisce e non è l'autore
  const visible = defs.map((def) => ({
    ...def,
    counters: def.counters.filter((c) => c.status === "approved" || canManage(user) || c.authorId === user.id),
  }));
  return NextResponse.json({ defs: visible });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || user.status !== "approved") {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }
  // Solo Admin/Revisore possono proporre nuove Difese (i Counter restano aperti a tutti).
  if (!canManage(user)) {
    return NextResponse.json({ error: "Solo Admin e Revisori possono creare nuove Difese." }, { status: 403 });
  }

  const { data, error } = await safeJson(request);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const { m1, m2, m3, desc } = data;
  const monsters = [m1, m2, m3];
  if (monsters.some((m) => !m || !m.trim())) {
    return NextResponse.json({ error: "Servono tutti e tre i mostri." }, { status: 400 });
  }
  for (const m of monsters) {
    if (!(await isKnownMonster(m))) {
      return NextResponse.json({ error: `"${m}" non è un mostro riconosciuto.` }, { status: 400 });
    }
  }

  const def = await createDef({
    monsters,
    desc,
    authorId: user.id,
    authorNickname: user.nickname,
    autoApprove: canManage(user),
  });
  return NextResponse.json({ def });
}
