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

function parseRaw(raw) {
  // Adatta qui se i nomi dei campi reali sono diversi.
  const name = raw.name || raw.monster_name;
  const element = raw.element || raw.attribute;
  const imageFilename = raw.image_filename;
  if (!name || !imageFilename) return null;
  if (raw.is_awakened === false) return null; // scarta le forme non risvegliate, doppioni inutili
  // Alcuni elementi del bestiario sono materiali di fusione (es. "Living
  // Armor") senza nome localizzato in inglese: swarfarm restituisce il nome
  // in coreano. Non sono mostri giocabili in una Difesa/Counter, li scartiamo.
  if (/[\u3131-\uD79D\u4E00-\u9FFF]/.test(name)) return null;

  return { name, element, iconUrl: `${ICON_BASE}${imageFilename}` };
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
    const raws = [];
    let url = `${SWARFARM_BASE}/api/v2/monsters/?is_awakened=true&limit=100`;
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

    // Per ogni mostro salviamo SEMPRE sia il nome nudo (es. "Savannah",
    // "Son Zhang Lao") sia quello con l'elemento davanti (es. "Wind
    // Savannah") quando l'elemento è noto. Crea qualche doppione nella
    // ricerca per i mostri con nome già unico, ma non nasconde MAI il
    // nome nudo — un doppione in più è molto meno grave di un mostro che
    // sparisce dall'elenco.
    const byLabel = new Map();
    for (const m of raws) {
      if (!byLabel.has(m.name)) byLabel.set(m.name, m);
      if (m.element) {
        const label = `${capitalize(m.element)} ${m.name}`;
        if (!byLabel.has(label)) byLabel.set(label, { name: label, iconUrl: m.iconUrl });
      }
    }
    const finalList = Array.from(byLabel.values()).map((m) => ({ name: m.name, iconUrl: m.iconUrl }));

    await setSyncedMonsters(finalList);

    return NextResponse.json({ ok: true, count: finalList.length });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
