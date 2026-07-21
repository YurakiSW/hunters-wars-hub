// Manda email tramite Resend (resend.com) — serve un account gratuito e
// una RESEND_API_KEY nelle variabili d'ambiente. Vedi .env.example.
const RESEND_API_URL = "https://api.resend.com/emails";

// Ora che floraluna.net è verificato su Resend, mandiamo da lì — così le
// email arrivano a chiunque, non solo al tuo indirizzo personale (limite
// del mittente di test "onboarding@resend.dev" usato prima).
const FROM_ADDRESS = "Hunters Wars <hunterswars@floraluna.net>";

export async function sendMail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY mancante: email non inviata a", to);
    return { ok: false, error: "RESEND_API_KEY non configurata" };
  }
  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("Errore invio email:", text);
      return { ok: false, error: text };
    }
    return { ok: true };
  } catch (err) {
    console.error("Errore invio email:", err);
    return { ok: false, error: String(err) };
  }
}

export async function sendWelcomeEmail(user) {
  const siteUrl = process.env.SITE_URL || "https://hunters-wars-hub.vercel.app";
  const html = `
    <div style="font-family: sans-serif; padding: 20px; background:#100e1c; color:#f3eefb;">
      <h1 style="color:#d3a94f;">Yuraki, il capo supremo, ti ha ritenuto degno! 🐺</h1>
      <p>Ciao ${user.nickname}, sei stato approvato su Hunters Wars — Counter Siege.</p>
      <p><a href="${siteUrl}/login" style="color:#9376f2;">Accedi al sito</a></p>
    </div>
  `;
  return sendMail(user.email, "Sei stato accettato in Hunters Wars!", html);
}

export async function sendRejectionEmail(user) {
  const html = `
    <div style="font-family: sans-serif; padding: 20px; background:#100e1c; color:#f3eefb;">
      <h1 style="color:#d84852;">Bella zio ci hai provato, ma non sei gradito ❤️</h1>
      <p>Ciao ${user.nickname}, la tua richiesta di accesso a Hunters Wars — Counter Siege è stata rifiutata.</p>
    </div>
  `;
  return sendMail(user.email, "Richiesta rifiutata — Hunters Wars", html);
}

export async function sendPasswordResetEmail(user, token) {
  const siteUrl = process.env.SITE_URL || "https://hunters-wars-hub.vercel.app";
  const link = `${siteUrl}/reset-password?token=${token}`;
  const html = `
    <div style="font-family: sans-serif; padding: 20px; background:#100e1c; color:#f3eefb;">
      <h1 style="color:#d3a94f;">Reimposta la tua password</h1>
      <p>Ciao ${user.nickname}, clicca qui sotto per scegliere una nuova password. Il link scade tra un'ora.</p>
      <p><a href="${link}" style="color:#9376f2;">Reimposta password</a></p>
      <p style="color:#7a6d97; font-size:12px;">Se non hai richiesto tu questo, ignora pure questa email.</p>
    </div>
  `;
  return sendMail(user.email, "Reimposta la password — Hunters Wars", html);
}
