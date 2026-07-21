import { redis } from "./redis";

const RESET_TTL_SECONDS = 60 * 60; // il link scade dopo 1 ora

function randomToken() {
  // 32 caratteri esadecimali, abbastanza per non essere indovinabile.
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createPasswordResetToken(userId) {
  const token = randomToken();
  await redis.set(`passwordReset:${token}`, userId, { ex: RESET_TTL_SECONDS });
  return token;
}

export async function consumePasswordResetToken(token) {
  const userId = await redis.get(`passwordReset:${token}`);
  if (!userId) return null;
  await redis.del(`passwordReset:${token}`); // un link si usa una volta sola
  return userId;
}
