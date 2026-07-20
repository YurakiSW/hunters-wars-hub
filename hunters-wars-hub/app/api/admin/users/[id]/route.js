import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../../lib/auth";
import { redis } from "../../../../../lib/redis";

export async function PATCH(request, { params }) {
  const admin = await getCurrentUser();
  if (!admin || !isAdmin(admin)) {
    return NextResponse.json({ error: "Solo l'Admin può modificare gli utenti." }, { status: 403 });
  }

  const key = `user:${params.id}`;
  const target = await redis.get(key);
  if (!target) return NextResponse.json({ error: "Utente non trovato." }, { status: 404 });

  const { role, canUploadRoster, status } = await request.json();
  const patch = {};
  if (role) {
    patch.role = role;
    patch.manualRole = true; // da qui in poi i futuri caricamenti roster non lo sovrascrivono più
    if (target.status === "pending" && role !== "pending") patch.status = "approved";
  }
  if (typeof canUploadRoster === "boolean") {
    patch.canUploadRoster = canUploadRoster;
    patch.manualPerm = true;
  }
  if (status) patch.status = status;

  const updated = { ...target, ...patch };
  await redis.set(key, updated);
  const { passwordHash, ...safe } = updated;
  return NextResponse.json({ user: safe });
}
