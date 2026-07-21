// Manda email tramite Resend (resend.com) — serve un account gratuito e
// una RESEND_API_KEY nelle variabili d'ambiente. Vedi .env.example.
const RESEND_API_URL = "https://api.resend.com/emails";

// Finché non verifichi un dominio vostro su Resend, il mittente deve
// restare "onboarding@resend.dev" (l'indirizzo di test che Resend dà a
// tutti gratis, senza bisogno di configurare nulla sul DNS). Se in futuro
// verificate floraluna.net o un dominio della gilda, basta cambiare
// questa riga con un indirizzo su quel dominio.
const FROM_ADDRESS = "Hunters Wars <onboarding@resend.dev>";

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
      <h1 style="color:#d3a94f;">Yuraki capo supremo ti ha ritenuto degno! 🐺</h1>
      <p>Ciao ${user.nickname}, sei stato approvato su Hunters Wars — Counter Siege.</p>
      <p><a href="${siteUrl}/login" style="color:#9376f2;">Accedi al sito</a></p>
    </div>
  `;
  return sendMail(user.email, "Sei stato accettato in Hunters Wars!", html);
}
