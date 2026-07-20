import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me");
const COOKIE_NAME = "hwh_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 giorni

// Firma un token di sessione contenente solo l'id utente (mai dati
// sensibili: la sessione è solo un riferimento, i dati veri restano su Redis).
export async function createSessionToken(userId) {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(SECRET);
}

export async function verifySessionToken(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET);
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
    maxAge: MAX_AGE_SECONDS,
  },
};
