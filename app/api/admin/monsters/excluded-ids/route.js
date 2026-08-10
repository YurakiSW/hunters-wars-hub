import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../../lib/auth";
import { addNeverCleanId, removeNeverCleanId } from "../../../../../lib/monsters";
import { safeJson } from "../../../../../lib/apiUtils";

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo Admin." }, { status: 403 });
  }
  const { data } = await safeJson(request);
  const com2usId = Number(data?.com2usId);
  if (!Number.isFinite(com2usId)) return NextResponse.json({ error: "com2usId mancante o non valido." }, { status: 400 });

  const list = await addNeverCleanId(com2usId);
  return NextResponse.json({ ok: true, list });
}

// Per correggere un'esclusione sbagliata (es. il caso Theomars/19211
// dell'08/08/2026: l'ID giusto era finito escluso per errore, invertendo
// tutto) — rimuove SOLO l'ID passato, mai in blocco.
export async function DELETE(request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo Admin." }, { status: 403 });
  }
  const { data } = await safeJson(request);
  const com2usId = Number(data?.com2usId);
  if (!Number.isFinite(com2usId)) return NextResponse.json({ error: "com2usId mancante o non valido." }, { status: 400 });

  const list = await removeNeverCleanId(com2usId);
  return NextResponse.json({ ok: true, list });
}

