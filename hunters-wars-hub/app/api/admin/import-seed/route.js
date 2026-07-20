import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../lib/auth";
import { createDef, createCounter } from "../../../../lib/defs";

// Consenti fino a 60s di esecuzione (l'import di tante Difese/Counter fatto
// una alla volta supererebbe il limite di default di Vercel e andrebbe in
// timeout, con una pagina di errore invece della risposta JSON attesa).
export const maxDuration = 60;

// Importazione dati: l'Admin carica il file JSON direttamente dal pannello
// (tab "Importa dati"), che lo manda qui come corpo della richiesta.
// Nessun file va aggiunto al repo per questo.
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo l'Admin può eseguire l'importazione." }, { status: 403 });
  }

  const seedData = await request.json();
  if (!Array.isArray(seedData)) {
    return NextResponse.json({ error: "Il file non è nel formato atteso (deve essere un elenco di Difese)." }, { status: 400 });
  }

  const errors = [];

  // Tutte le Difese in parallelo (sono indipendenti tra loro) — molto più
  // veloce che scriverle una alla volta.
  const defResults = await Promise.all(
    seedData.map(async (defData) => {
      try {
        const def = await createDef({
          monsters: defData.monsters,
          desc: defData.desc || "",
          authorId: user.id,
          authorNickname: user.nickname,
          autoApprove: defData.status === "approved",
        });

        // E per ogni Difesa, tutti i suoi Counter in parallelo.
        const counterResults = await Promise.allSettled(
          (defData.counters || []).map((c) =>
            createCounter(
              def.id,
              {
                offense: c.offense,
                lead: c.lead,
                turnOrder: c.turnOrder,
                units: c.units,
                focus: c.focus,
                strategy: c.strategy,
                warning: c.warning || "",
                video: null,
                images: [],
              },
              { authorId: user.id, authorNickname: c.author || user.nickname, autoApprove: c.status === "approved" }
            )
          )
        );
        const counterErrors = counterResults
          .filter((r) => r.status === "rejected")
          .map((r) => `Counter su ${defData.monsters.join("/")}: ${String(r.reason)}`);
        const importedCounters = counterResults.filter((r) => r.status === "fulfilled").length;

        return { ok: true, importedCounters, errors: counterErrors };
      } catch (e) {
        return { ok: false, importedCounters: 0, errors: [`Difesa ${defData.monsters.join("/")}: ${String(e)}`] };
      }
    })
  );

  const importedDefs = defResults.filter((r) => r.ok).length;
  const importedCounters = defResults.reduce((sum, r) => sum + r.importedCounters, 0);
  for (const r of defResults) errors.push(...r.errors);

  return NextResponse.json({ ok: true, importedDefs, importedCounters, errors });
}
