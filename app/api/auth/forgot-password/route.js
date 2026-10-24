import { NextResponse } from "next/server";
import { redis } from "../../../../lib/redis";
import { createPasswordResetToken } from "../../../../lib/passwordReset";
import { sendPasswordResetEmail } from "../../../../lib/email";
import { safeJson } from "../../../../lib/apiUtils";

export async function POST(request) {
  const { data, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });
  const { email } = data;
  if (!email) return NextResponse.json({ error: "Email obbligatoria." }, { status: 400 });

  // Risposta identica sia che l'email esista o no: altrimenti chiunque
  // potrebbe scoprire quali email sono registrate provando a caso.
  try {
    const userId = await redis.get(`user:byEmail:${email.trim().toLowerCase()}`);
    if (userId) {
      const user = await redis.get(`user:${userId}`);
      if (user) {
        const token = await createPasswordResetToken(userId);
        // 24/10/2026 (Flora: "il recupero password non funziona"): qui prima
        // c'era `sendPasswordResetEmail(...).catch(() => {})` SENZA await.
        // Su Vercel la funzione viene congelata appena la risposta parte, quindi
        // la richiesta a Resend poteva restare a metà e l'email non partire mai,
        // senza nessun errore da nessuna parte. Ora si ASPETTA l'invio prima di
        // rispondere (la risposta resta uguale per chi guarda: sempre ok:true).
        const result = await sendPasswordResetEmail(user, token);
        if (!result.ok) {
          // Visibile nei log di Vercel (Logs → cerca "Recupero password").
          console.error("Recupero password: email NON inviata a", user.email || "(nessuna email salvata)", "-", result.error);
        }
      } else {
        console.error("Recupero password: indice email trovato ma utente mancante:", userId);
      }
    }
  } catch (err) {
    console.error("Recupero password: errore inatteso:", err);
  }

  return NextResponse.json({ ok: true });
}
