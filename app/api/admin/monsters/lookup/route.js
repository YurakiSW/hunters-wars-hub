import { NextResponse } from "next/server";
import { getCurrentUser, canManage } from "../../../../../lib/auth";

// Stesso fix di app/api/monsters/sync/route.js — swarfarm a volte
// restituisce nomi già corrotti da una doppia codifica (byte UTF-8 letti
// come Windows-1252, es. "Übel" -> "Ãœbel"). Qui è solo per la
// visualizzazione del tool diagnostico, "raw" sotto resta il dato grezzo
// intatto per trasparenza.
const CP1252_CHAR_TO_BYTE = (() => {
  const dec = new TextDecoder("windows-1252");
  const map = new Map();
  for (let b = 0; b < 256; b++) map.set(dec.decode(new Uint8Array([b])), b);
  return map;
})();
function fixMojibake(name) {
  if (!name || !name.includes("\u00c3")) return name;
  const bytes = [];
  for (const ch of name) {
    const b = CP1252_CHAR_TO_BYTE.get(ch);
    if (b === undefined) return name;
    bytes.push(b);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return name;
  }
}

// Strumento diagnostico: cerca UN com2us_id direttamente su swarfarm, in
// diretta — non dal bestiario sincronizzato (che potrebbe avere buchi),
// ma dalla fonte vera. Utile ogni volta che salta fuori un "Sconosciuto"
// e serve capire subito di che mostro si tratta, senza aspettare.
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user || !canManage(user)) {
    return NextResponse.json({ error: "Solo Admin e Revisori." }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const com2usId = searchParams.get("id");
  if (!com2usId || !/^\d+$/.test(com2usId)) {
    return NextResponse.json({ error: "Serve un ID numerico (?id=12345)." }, { status: 400 });
  }

  // Usa /api/bestiary (verificato funzionante stasera, a differenza di
  // /api/v2/monsters/ che non è mai stato confermato con certezza) — non
  // ha paginazione, restituisce tutto in un colpo solo. Più pesante di
  // una vera ricerca filtrata, ma è uno strumento usato ogni tanto a
  // mano, non in un ciclo automatico, va benissimo così.
  const res = await fetch("https://swarfarm.com/api/bestiary?format=json", { headers: { Accept: "application/json" } });
  if (!res.ok) return NextResponse.json({ error: `swarfarm risposta ${res.status}` }, { status: 502 });
  const items = await res.json();
  const target = Number(com2usId);
  const found = (Array.isArray(items) ? items : []).find((m) => m.com2us_id === target);
  if (!found) return NextResponse.json({ ok: true, found: false });
  return NextResponse.json({
    ok: true,
    found: true,
    name: fixMojibake(found.name),
    element: found.element,
    archetype: found.archetype,
    com2usId: found.com2us_id,
    iconUrl: found.image_filename ? `https://swarfarm.com/static/herders/images/monsters/${found.image_filename}` : null,
    pk: found.pk,
    raw: found,
  });
}

