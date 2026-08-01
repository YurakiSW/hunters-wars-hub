import { NextResponse } from "next/server";
import { getCurrentUser, canManage } from "../../../lib/auth";
import { listDefs, createDef, findMatchingDef } from "../../../lib/defs";
import { isKnownMonster } from "../../../lib/monsters";
import { safeJson } from "../../../lib/apiUtils";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.status !== "approved") {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }
  const defs = await listDefs();
  return NextResponse.json({ defs });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || user.status !== "approved") {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }
  // Ora TUTTI i membri approvati possono proporre una Difesa nuova, non
  // solo Admin/Revisori — chi non gestisce contenuti la propone e basta,
  // resta "in attesa" finché un manager non la approva (stesso principio
  // già in uso per i Counter proposti da chiunque).

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

  // Stesso leader (il primo mostro, per convenzione) + stessi altri due,
  // in qualunque ordine -> è la stessa difesa già presente: si blocca.
  // Stessi 3 mostri ma leader diverso -> è un'altra difesa (il leader
  // cambia le buff di squadra): si crea, ma va comunque in revisione se
  // non è un manager a proporla.
  const { exact, sameTrioDifferentLeader } = await findMatchingDef(monsters);
  if (exact) {
    return NextResponse.json(
      { error: `Questa difesa esiste già: ${exact.monsters.join(" / ")} (leader ${exact.monsters[0]}). Usa quella invece di crearne una nuova.` },
      { status: 409 }
    );
  }

  const def = await createDef({
    monsters,
    desc,
    authorId: user.id,
    authorNickname: user.nickname,
    autoApprove: canManage(user),
  });
  return NextResponse.json({
    def,
    // Avviso non bloccante: stessi 3 mostri ma leader diverso da una
    // difesa già esistente — creata comunque, ma meglio saperlo.
    note: sameTrioDifferentLeader
      ? `Attenzione: esiste già una difesa con questi stessi 3 mostri ma leader diverso (${sameTrioDifferentLeader.monsters[0]}). Questa è stata creata come difesa a sé.`
      : null,
  });
}
