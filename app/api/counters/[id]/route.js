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

// "Segnala problema": qualsiasi membro approvato può rimettere un counter
// GIÀ approvato in coda "in attesa" per farlo ricontrollare — non è una
// modifica vera, serve solo ad aiutare i gestori a intercettare i
// problemi più in fretta. Modifiche vere restano riservate (canEdit sopra).
function canFlagForReview(user, counter) {
  return user.status === "approved" && counter.status === "approved";
}

export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!user || user.status !== "approved") return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });

  const counter = await getCounter(params.id);
  if (!counter) return NextResponse.json({ error: "Non trovato." }, { status: 404 });

  const { data: payload, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });

  const isJustFlagging = payload.status === "pending" && !payload.units;
  if (isJustFlagging) {
    if (!canFlagForReview(user, counter)) {
      return NextResponse.json({ error: "Non puoi segnalare questo counter." }, { status: 403 });
    }
    const updated = await updateCounter(params.id, { status: "pending", approvedById: null, approvedByNickname: null });
    return NextResponse.json({ counter: updated });
  }

  if (!canEdit(user, counter)) return NextResponse.json({ error: "Non puoi modificare questo counter." }, { status: 403 });

  // Solo Admin/Revisore possono cambiare lo stato (approva/rifiuta) tramite questo campo;
  // qualsiasi altra modifica riporta comunque il counter in "pending".
  if (payload.status && !canManage(user)) {
    delete payload.status;
  }
  // Registra CHI ha approvato, oltre a chi l'ha proposto — utile per
  // sapere chi ha vagliato quel counter.
  if (payload.status === "approved") {
    payload.approvedById = user.id;
    payload.approvedByNickname = user.nickname;
  }

  if (payload.units) {
    // Se una persona modifica un counter arrivato dal Siege Log, la sua
    // correzione deve resistere agli automatismi: il resync non deve
    // sovrascriverla con i valori ricalcolati dal log, e la pulizia dei
    // doppioni non deve cancellarla come se fosse contenuto rigenerabile.
    // (Capita eccome: un attacco può vincere pur avendo artefatti sbagliati
    // nel replay, e chi conosce il gioco corregge a mano.)
    if (counter.authorNickname === "Siege Log") {
      payload.manuallyEdited = true;
      payload.editedByNickname = user.nickname;
    }
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
    payload.offense = payload.units.slice(0, 3).map((u) => u.name);
    payload.lead = payload.units.slice(0, 3).find((u) => u.lead)?.name || payload.units[0].name;
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
