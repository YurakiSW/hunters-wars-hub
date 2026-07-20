import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redis } from "./redis";
import { SESSION_COOKIE, verifySessionToken } from "./session";

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// Legge la sessione dal cookie e restituisce l'utente completo da Redis
// (o null se non loggato / cookie non valido). Da usare in Server
// Components e API route — mai fidarsi di dati mandati dal client.
export async function getCurrentUser() {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE.name)?.value;
  if (!token) return null;
  const userId = await verifySessionToken(token);
  if (!userId) return null;
  const user = await redis.get(`user:${userId}`);
  return user || null;
}

// Ruoli: "pending" | "member" | "reviewer" | "admin"
// Chi gestisce contenuti (approvare/modificare/eliminare Difese e Counter,
// vedere il Pannello Gestione): admin e reviewer.
export function canManage(user) {
  return user?.role === "admin" || user?.role === "reviewer";
}

export function isAdmin(user) {
  return user?.role === "admin";
}

// Grado in game -> ruolo di partenza sul sito, secondo la mappatura
// decisa con la gilda: 1 = Capogilda -> admin; 3 = Vice -> member (ma con
// permesso di caricare il roster); 2 e 4 = player normali -> member.
export function defaultRoleForGrade(grade) {
  if (grade === 1) return "admin";
  return "member";
}
export function defaultCanUploadRosterForGrade(grade) {
  return grade === 3;
}
