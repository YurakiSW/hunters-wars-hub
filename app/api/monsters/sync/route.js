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
  const com2usId = raw.com2us_id;
  // Accuracy BASE della specie: è l'UNICA stat base che il replay di Siege
  // non contiene mai (con/atk/def/spd/resist ci sono tutte, verificato:
  // es. Nobara resist 15 e Gandalf 40, entrambi corretti). Quasi tutti i
  // mostri hanno 0, ma alcuni no (es. Wind Nobara Kugisaki ha 25%) — senza
  // questo dato la Accuracy mostrata era sbagliata proprio per quei mostri.
  // Nomi di campo difensivi: se swarfarm cambia schema, resta null e il
  // calcolo si comporta come prima (base 0) invece di rompersi.
  const baseAccuracy = raw.accuracy ?? raw.base_accuracy ?? null;
  if (!name || !imageFilename) return null;
  // Alcuni elementi del bestiario sono materiali di fusione (es. "Living
  // Armor") senza nome localizzato in inglese: swarfarm restituisce il nome
  // in coreano. Non sono mostri giocabili in una Difesa/Counter, li scartiamo.
  if (/[\u3131-\uD79D\u4E00-\u9FFF]/.test(name)) return null;

  return { name, element, iconUrl: `${ICON_BASE}${imageFilename}`, com2usId, baseAccuracy };
}

// Logica vera della sincronizzazione, separata dalla route: la usano sia il
// link con il segreto (per il cron) sia il pulsante in Diagnostica, così
// non esistono due copie della stessa cosa che possono divergere.
export async function syncMonstersFromSwarfarm() {
  {
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
        finalList.push({ name, iconUrl: variants[0].iconUrl, com2usId: variants[0].com2usId, baseAccuracy: variants[0].baseAccuracy });
      } else {
        // Stesso nome su più elementi = mostro da collaborazione: i mostri
        // normali hanno un nome diverso per ogni elemento (Raoq, Kro,
        // Lushen...), i collab riusano il nome del personaggio su tutte le
        // varianti. Lo marchiamo qui, così la tabella delle corrispondenze
        // in admin si popola da sola con OGNI collab presente e futuro,
        // senza elenchi scritti a mano.
        // Unica eccezione nota: gli Homunculus, che condividono il nome tra
        // elementi pur non essendo collab.
        const isCollab = !/homunculus/i.test(name);
        for (const v of variants) {
          finalList.push({ name: `${v.element} ${name}`, iconUrl: v.iconUrl, com2usId: v.com2usId, baseAccuracy: v.baseAccuracy, isCollab });
        }
      }
    }

    await setSyncedMonsters(finalList);
    return { count: finalList.length };
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncMonstersFromSwarfarm();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
