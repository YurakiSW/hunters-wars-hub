import { redis } from "./redis";
import { setRoster, normalizeNickname } from "./roster";
import { defaultRoleForGrade, defaultCanUploadRosterForGrade } from "./auth";

// Aggiorna il roster condiviso E gli account del sito che combaciano. È
// ESATTAMENTE la logica che stava dentro POST /api/admin/roster (spostata qui
// il 16/10/2026 per usarla anche dal plugin SWEX, senza due copie che prima o
// poi divergono): stessa cosa per l'upload a mano del JSON e per l'invio
// automatico.
export async function applyRosterUpdate(entries) {
  await setRoster(entries);

  // Ricalcola ruolo/permesso di ogni utente esistente che combacia col nuovo
  // roster, MA solo se non è stato impostato a mano dall'Admin in precedenza.
  // Nota: KEYS è ok per una gilda (poche decine di utenti); se in futuro
  // servisse scalare molto di più, meglio mantenere un Set "user:ids" come
  // fatto per le Difese in lib/defs.js.
  const userIds = await redis.keys("user:user_*");
  const notFound = [];
  for (const key of userIds) {
    const u = await redis.get(key);
    if (!u) continue;
    const match = entries.find((r) => normalizeNickname(r.nickname) === normalizeNickname(u.nickname));

    if (!match) {
      // Non combacia col roster appena caricato — MA non significa per
      // forza che abbia lasciato la gilda: può aver semplicemente
      // cambiato nickname in gioco. Non si elimina più in automatico:
      // finisce in una lista di revisione che l'Admin conferma a mano
      // (vedi POST /api/admin/roster/remove-members).
      if (u.role !== "admin") {
        notFound.push({ id: u.id, nickname: u.nickname, email: u.email || null, grade: u.grade, role: u.role });
      }
      continue;
    }

    const patch = { grade: match.grade };
    if (u.status === "pending") patch.status = "approved";
    if (!u.manualRole) patch.role = defaultRoleForGrade(match.grade);
    if (!u.manualPerm) patch.canUploadRoster = defaultCanUploadRosterForGrade(match.grade);
    await redis.set(key, { ...u, ...patch });
  }

  // Sovrascrive la lista di revisione con quella appena calcolata (riflette
  // sempre lo stato ATTUALE roster-vs-sito, non si accumula tra un upload
  // e l'altro).
  await redis.set("roster:removal_candidates", notFound);
  return { count: entries.length, notFound };
}

// true se il roster in arrivo è uguale a quello salvato (stessi account,
// stesso nome, stesso grado): in quel caso l'invio automatico non rifà niente.
export function sameRoster(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const sig = (r) => `${r.wizardId ?? ""}|${r.nickname}|${r.grade}`;
  const sa = a.map(sig).sort();
  const sb = b.map(sig).sort();
  return sa.every((v, i) => v === sb[i]);
}
