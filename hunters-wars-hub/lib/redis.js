import { Redis } from "@upstash/redis";

// Client unico riusato in tutte le API route. Le credenziali vengono
// prese dalle variabili d'ambiente configurate su Vercel (stesse impostate
// per SW Auto Redeemer, ma puntate a un database Upstash diverso).
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
