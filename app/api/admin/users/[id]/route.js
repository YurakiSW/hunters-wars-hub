import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../../lib/auth";
import { redis } from "../../../../../lib/redis";
import { sendWelcomeEmail, sendRejectionEmail } from "../../../../../lib/email";

export async function PATCH(request, { params }) {
  const admin = await getCurrentUser();
  if (!admin || !isAdmin(admin)) {
    return NextResponse.json({ error: "Solo l'Admin può modificare gli utenti." }, { status: 403 });
  }

  const key = `user:${params.id}`;
  const target = await redis.get(key);
  if (!target) return NextResponse.json({ error: "Utente non trovato." }, { status: 404 });

  const wasPending = target.status === "pending";

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

  // Se l'Admin ha appena approvato a mano qualcuno che era "in attesa",
  // parte la mail di benvenuto. Aspettiamo il risultato (non blocca a
  // lungo, Resend risponde in millisecondi) così un eventuale errore
  // finisce nei log di Vercel invece di sparire in silenzio.
  let emailResult = null;
  if (wasPending && updated.status === "approved" && updated.email) {
    emailResult = await sendWelcomeEmail(updated);
    if (!emailResult.ok) console.error("Email di benvenuto non inviata:", emailResult.error);
  }

  const { passwordHash, ...safe } = updated;
  return NextResponse.json({ user: safe, emailResult });
}

// Elimina un utente (usato sia per "Rifiuta" su chi è in attesa, sia per
// rimuovere in generale un account già approvato). Non tocca mai Difese/
// Counter già creati da quella persona: l'autore ci resta scritto sopra
// come testo, non dipende dall'account che esiste ancora.
export async function DELETE(request, { params }) {
  const admin = await getCurrentUser();
  if (!admin || !isAdmin(admin)) {
    return NextResponse.json({ error: "Solo l'Admin può eliminare un utente." }, { status: 403 });
  }

  const key = `user:${params.id}`;
  const target = await redis.get(key);
  if (!target) return NextResponse.json({ error: "Utente non trovato." }, { status: 404 });
  if (target.role === "admin") {
    return NextResponse.json({ error: "Non puoi eliminare un account Admin da qui." }, { status: 403 });
  }

  // La mail scherzosa di rifiuto parte solo se stavamo davvero rifiutando
  // una richiesta in attesa — rimuovere un membro già approvato non manda
  // nessuna notifica, non è un "rifiuto".
  if (target.status === "pending" && target.email) {
    sendRejectionEmail(target).catch(() => {});
  }

  await redis.del(key);
  if (target.email) await redis.del(`user:byEmail:${target.email.toLowerCase()}`);

  return NextResponse.json({ ok: true });
}
