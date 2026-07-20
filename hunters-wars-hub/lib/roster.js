import { redis } from "./redis";

const ROSTER_KEY = "guild:roster"; // [{ nickname, grade }]

export async function getRoster() {
  return (await redis.get(ROSTER_KEY)) || [];
}

// Sovrascrive il roster condiviso (unico per tutta la gilda: chi lo carica
// non conta, il contenuto è lo stesso per tutti visto che riflette la
// gilda intera). Chiamato dall'API roster upload.
export async function setRoster(entries) {
  await redis.set(ROSTER_KEY, entries);
  await redis.set("guild:roster:updatedAt", Date.now());
}

export function findRosterEntry(roster, nickname) {
  const clean = (nickname || "").trim().toLowerCase();
  return roster.find((r) => (r.nickname || "").trim().toLowerCase() === clean) || null;
}

// Estrae SOLO nickname e grado da un export JSON completo del gioco
// (tipo SWEX/SWProxy). Scarta tutto il resto (session_key, inventario,
// rune...) per non salvare mai dati sensibili dell'account.
export function extractRosterFromGameExport(raw) {
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  const members = data?.guild?.guild_members;
  if (!members) throw new Error("Non trovo guild.guild_members in questo file.");
  return Object.values(members).map((m) => ({ nickname: m.wizard_name, grade: m.grade }));
}
