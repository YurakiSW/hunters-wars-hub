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
    // Prima le forme risvegliate standard (awaken_level=1), poi le SECONDE
    // awakening (awaken_level=2) — scoperto il 01/08/2026 (grazie a Flora,
    // che ha beccato ID 14034 = Eshir 2ª awakening mancante nelle Difese
    // Gilda): il filtro escludeva DEL TUTTO queste forme, non solo le
    // nascondeva. Compaiono davvero nei log di siege, vanno sincronizzate.
    for (const level of [1, 2]) {
      let url = `${SWARFARM_BASE}/api/v2/monsters/?awaken_level=${level}&limit=100`;
      let guard = 0;
      while (url && guard < 100) {
        guard++;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`swarfarm risposta ${res.status}`);
        const data = await res.json();
        const items = data.results || data;
        for (const raw of Array.isArray(items) ? items : []) {
          const parsed = parseRaw(raw);
          if (parsed) raws.push({ ...parsed, awakenLevel: level });
        }
        url = data.next || null;
      }
    }

    // Un nome, un'icona — TRANNE due casi che vanno disambiguati, altrimenti
    // si sovrascrivono a vicenda nella stessa chiave:
    //  1) stesso nome su più elementi = collab (es. Nobara/Aragorn) -> si
    //     antepone l'elemento
    //  2) stesso nome (ed elemento) ma awaken_level diverso = seconda
    //     awakening (es. Eshir normale vs Eshir 2ª awakening) -> si
    //     aggiunge " 2A" alla seconda, la prima resta col nome
    //     semplice (è quella che la gente si aspetta di trovare cercando
    //     "Eshir" senza altro)
    const byBareName = new Map();
    for (const m of raws) {
      if (!byBareName.has(m.name)) byBareName.set(m.name, []);
      byBareName.get(m.name).push(m);
    }

    const finalList = [];
    for (const [name, variants] of byBareName) {
      const uniqueElements = new Set(variants.map((v) => v.element));
      // Etichetta di seconda awakening SOLO se per quel nome+elemento
      // esistono davvero entrambe le forme (altrimenti un mostro con solo
      // la forma 2 sincronizzata — capita raramente — resterebbe etichettato
      // "2A" anche se è l'unica versione disponibile, confondendo
      // inutilmente chi cerca il nome semplice).
      const labelSecondAwaken = (v, sameGroup) => {
        const hasBothLevels = sameGroup.some((x) => x.awakenLevel === 1) && sameGroup.some((x) => x.awakenLevel === 2);
        return hasBothLevels && v.awakenLevel === 2 ? " 2A" : "";
      };
      if (uniqueElements.size <= 1) {
        for (const v of variants) {
          const suffix = labelSecondAwaken(v, variants);
          finalList.push({ name: `${name}${suffix}`, iconUrl: v.iconUrl, com2usId: v.com2usId, baseAccuracy: v.baseAccuracy });
        }
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
        for (const element of uniqueElements) {
          const sameElement = variants.filter((v) => v.element === element);
          for (const v of sameElement) {
            const suffix = labelSecondAwaken(v, sameElement);
            finalList.push({ name: `${v.element} ${name}${suffix}`, iconUrl: v.iconUrl, com2usId: v.com2usId, baseAccuracy: v.baseAccuracy, isCollab });
          }
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
