import { NextResponse } from "next/server";
import { setSyncedMonsters } from "../../../../lib/monsters";

// Chiamata da cron-job.org (stesso meccanismo usato per SW Auto Redeemer):
// GET /api/monsters/sync?secret=CRON_SECRET
//
// Campi verificati leggendo il codice sorgente reale di swarfarm
// (github.com/swarfarm/swarfarm, bestiary/serializers.py + models/monsters.py):
// name, image_filename, element, awaken_level (0=non risvegliato,
// 1=risvegliato, 2=secondo risveglio, -1=incompleto). Il parametro
// "awaken_level=1" nella query filtra lato server solo le forme
// risvegliate standard — quella giusta da usare per una Difesa/Counter.
const SWARFARM_BASE = "https://swarfarm.com";
const ICON_BASE = "https://swarfarm.com/static/herders/images/monsters/";

function parseRaw(raw) {
  const name = raw.name;
  const element = raw.element;
  const imageFilename = raw.image_filename;
  if (!name || !imageFilename) return null;
  // Alcuni elementi del bestiario sono materiali di fusione (es. "Living
  // Armor") senza nome localizzato in inglese: swarfarm restituisce il nome
  // in coreano. Non sono mostri giocabili in una Difesa/Counter, li scartiamo.
  if (/[\u3131-\uD79D\u4E00-\u9FFF]/.test(name)) return null;

  return { name, element, iconUrl: `${ICON_BASE}${imageFilename}` };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const raws = [];
    let url = `${SWARFARM_BASE}/api/v2/monsters/?awaken_level=1&limit=100`;
    let guard = 0;
    while (url && guard < 100) {
      guard++;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`swarfarm risposta ${res.status}`);
      const data = await res.json();
      const items = data.results || data;
      for (const raw of Array.isArray(items) ? items : []) {
        const parsed = parseRaw(raw);
        if (parsed) raws.push(parsed);
      }
      url = data.next || null;
    }

    // Un nome, un'icona — TRANNE per i pochi mostri con lo stesso nome su
    // più elementi (le vere collab, es. Nobara/Aragorn): per quelli si
    // aggiunge l'elemento davanti, altrimenti sarebbero ambigui. Ora che
    // filtriamo per awaken_level=1 lato server, non ci sono più forme
    // diverse a creare falsi "doppioni" — il conteggio è affidabile.
    const byBareName = new Map();
    for (const m of raws) {
      if (!byBareName.has(m.name)) byBareName.set(m.name, []);
      byBareName.get(m.name).push(m);
    }

    const finalList = [];
    for (const [name, variants] of byBareName) {
      const uniqueElements = new Set(variants.map((v) => v.element));
      if (uniqueElements.size <= 1) {
        finalList.push({ name, iconUrl: variants[0].iconUrl });
      } else {
        for (const v of variants) {
          finalList.push({ name: `${v.element} ${name}`, iconUrl: v.iconUrl });
        }
      }
    }

    await setSyncedMonsters(finalList);

    return NextResponse.json({ ok: true, count: finalList.length });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
