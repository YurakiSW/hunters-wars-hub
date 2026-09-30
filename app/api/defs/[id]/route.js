import { NextResponse } from "next/server";
import { redis } from "../../../../lib/redis";
import { getCurrentUser, canManage } from "../../../../lib/auth";
import { getDef, updateDef, deleteDef, findMatchingDef } from "../../../../lib/defs";
import { isKnownMonster, getCanonicalNameMap } from "../../../../lib/monsters";
import { canonicalMonsterName } from "../../../../lib/textUtils";
import { safeJson } from "../../../../lib/apiUtils";
import { defenseKey } from "../../../../lib/siegeLogParser";
import { getDefenseOverallWinRate } from "../../../../lib/siegeStats";

export async function GET(request, { params }) {
  const user = await getCurrentUser();
  if (!user || user.status !== "approved") return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  const def = await getDef(params.id);
  if (!def) return NextResponse.json({ error: "Non trovata." }, { status: 404 });
  // Winrate complessivo della gilda contro questa difesa (29/09/2026,
  // 30/09/2026 — Flora, corretto): i nomi vanno CANONICALIZZATI prima di
  // calcolare la chiave, esattamente come fa l'import quando registra un
  // attacco (app/api/admin/import-siege-log/route.js, `defense.map(canon)`).
  // Senza questo passaggio, una difesa il cui nome salvato non coincide più
  // con la forma canonica attuale (es. mappatura aggiornata dopo che la
  // difesa era già stata creata) risultava sempre "nessun dato", anche con
  // counter approvati e battaglie vere registrate sotto la chiave giusta.
  const canonicalMap = await getCanonicalNameMap();
  const canonicalMonsterNames = def.monsters.map((n) => canonicalMonsterName(n, canonicalMap));
  // Flora): somma su TUTTI i counter mai provati, non solo quello
  // approvato — vedi la nota in getDefenseOverallWinRate.
  const overallWinRate = await getDefenseOverallWinRate(defenseKey(canonicalMonsterNames));
  // Tracciamento uso del sito (27/09/2026, Flora): ogni apertura di una
  // scheda Difesa/Counter conta, ripetizioni comprese — serve a distinguere
  // chi guarda davvero i counter prima di giocare da chi non lo fa mai.
  // Non blocca la risposta: se il salvataggio fallisce non deve impedire
  // di vedere la difesa.
  redis.get(`user:${user.id}`).then((fresh) => {
    if (!fresh) return;
    fresh.lastCounterViewAt = Date.now();
    fresh.counterViewCount = (fresh.counterViewCount || 0) + 1;
    return redis.set(`user:${user.id}`, fresh);
  }).catch(() => {});
  return NextResponse.json({ def, overallWinRate });
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
  // Stesso controllo della creazione: valeva anche solo per i membri normali
  // prima, ma modificare i mostri di una difesa già esistente fino a farla
  // combaciare con un'altra è la stessa identica cosa — vale per TUTTI,
  // Admin compreso. Si esclude questa stessa difesa dal confronto (altrimenti
  // salvarla senza cambiare i mostri si bloccherebbe da sola).
  const { exact } = await findMatchingDef(monsters, params.id);
  if (exact) {
    return NextResponse.json(
      { error: `Questa difesa esiste già: ${exact.monsters.join(" / ")} (leader ${exact.monsters[0]}). Non puoi modificarla fino a farla combaciare con un'altra.` },
      { status: 409 }
    );
  }
  // Questo endpoint richiede già canManage (solo Admin/Revisori) — non ha
  // senso rimandarla "in attesa" per una nuova approvazione, dato che chi
  // la modifica è già autorizzato ad approvarla. Lo stato resta invariato.
  const def = await updateDef(params.id, { monsters, desc });
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
