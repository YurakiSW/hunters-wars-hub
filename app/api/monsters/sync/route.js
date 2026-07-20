import { NextResponse } from "next/server";
import { setSyncedMonsters } from "../../../../lib/monsters";

// Chiamata da cron-job.org (stesso meccanismo usato per SW Auto Redeemer):
// GET /api/monsters/sync?secret=CRON_SECRET
//
// IMPORTANTE — da verificare al primo deploy:
// L'endpoint esatto dell'API v2 di swarfarm per l'elenco mostri non è
// documentato in modo leggibile pubblicamente (la doc è in formato
// CoreAPI binario). Questo codice assume la convenzione standard REST di
// Django REST Framework usata dal resto del sito (viewset paginato su
// /api/v2/monsters/, con "results", "next", e campi name/element/
// image_filename per ogni mostro) — che è lo stesso schema usato da SWOP
// e dagli altri tool della community. Se al primo giro la risposta non
// torna nel formato atteso, va aperta https://swarfarm.com/api/v2/monsters/
// da browser per vedere la struttura reale e aggiustare i nomi dei campi
// qui sotto (sono isolati nella funzione parseMonster).
const SWARFARM_BASE = "https://swarfarm.com";
const ICON_BASE = "https://swarfarm.com/static/herders/images/monsters/";

function parseMonster(raw) {
  // Adatta qui se i nomi dei campi reali sono diversi.
  const name = raw.name || raw.monster_name;
  const element = raw.element || raw.attribute;
  const imageFilename = raw.image_filename;
  if (!name || !imageFilename) return null;
  // Alcuni mostri sono "family" con più elementi: per quelli con più
  // varianti, il nome visibile include l'elemento (es. "Water Nobara"),
  // per i mostri a elemento fisso resta solo il nome base.
  const displayName = raw.is_awakened === false ? null : name; // scarta le forme non risvegliate, doppioni inutili
  if (!displayName) return null;
  const label = element && raw.awaken_bonus_content ? `${capitalize(element)} ${name}` : name;
  return { name: label, iconUrl: `${ICON_BASE}${imageFilename}` };
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const results = [];
    let url = `${SWARFARM_BASE}/api/v2/monsters/?is_awakened=true&limit=100`;
    let guard = 0;
    while (url && guard < 100) {
      guard++;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`swarfarm risposta ${res.status}`);
      const data = await res.json();
      const items = data.results || data;
      for (const raw of Array.isArray(items) ? items : []) {
        const parsed = parseMonster(raw);
        if (parsed) results.push(parsed);
      }
      url = data.next || null;
    }

    // Dedup per nome (mantieni il primo trovato)
    const byName = new Map();
    for (const m of results) if (!byName.has(m.name)) byName.set(m.name, m);
    const finalList = Array.from(byName.values());

    await setSyncedMonsters(finalList);

    return NextResponse.json({ ok: true, count: finalList.length });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
