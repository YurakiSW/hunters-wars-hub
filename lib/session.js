import { SignJWT, jwtVerify } from "jose";

// SICUREZZA: il fallback qui sotto è SOLO per sviluppo locale. In
// produzione, se SESSION_SECRET non è impostata, meglio far fallire la
// singola richiesta (errore chiaro nei log di Vercel) piuttosto che firmare
// le sessioni con una chiave scritta nel codice sorgente e nota a chiunque —
// altrimenti chiunque potrebbe forgiare un cookie di sessione valido.
// Il controllo è dentro le funzioni (non a livello di modulo) apposta: a
// livello di modulo farebbe fallire anche la fase di build di Next.js
// (raccolta dati delle route), che gira prima che le env var di produzione
// siano garantite disponibili.
function getSecret() {
  if (!process.env.SESSION_SECRET) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET mancante in produzione — impostala nelle variabili d'ambiente di Vercel prima di deployare.");
    }
    return new TextEncoder().encode("dev-only-insecure-secret-change-me");
  }
  return new TextEncoder().encode(process.env.SESSION_SECRET);
}
const COOKIE_NAME = "hwh_session";
const LONG_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 giorni — "Resta connesso" spuntato
const SHORT_MAX_AGE_SECONDS = 60 * 60 * 24; // 1 giorno — di riserva se il cookie di sessione sopravvive comunque

// Firma un token di sessione contenente solo l'id utente (mai dati
// sensibili: la sessione è solo un riferimento, i dati veri restano su Redis).
// "persistent" = true quando l'utente ha spuntato "Resta connesso".
export async function createSessionToken(userId, persistent = true) {
  const maxAge = persistent ? LONG_MAX_AGE_SECONDS : SHORT_MAX_AGE_SECONDS;
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload.uid || null;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = {
  name: COOKIE_NAME,
  options: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: LONG_MAX_AGE_SECONDS,
  },
};

// Se "persistent" è false, il cookie non ha maxAge/expires: il browser lo
// tratta come cookie di sessione e lo cancella da solo alla chiusura —
// esattamente il comportamento di "Resta connesso" NON spuntato.
export function sessionCookieOptions(persistent = true) {
  if (persistent) return SESSION_COOKIE.options;
  const { maxAge, ...rest } = SESSION_COOKIE.options;
  return rest;
}
