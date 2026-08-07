import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "../../../../../lib/auth";
import { getSyncedMonsters, getNeverCleanIds } from "../../../../../lib/monsters";

const SWARFARM_BASE = "https://swarfarm.com";
const BATCH = 10;

// Trova i pk di com2us_id specifici passando dalla LISTA (non c'è un
// endpoint di dettaglio-per-com2us_id diretto) — stesso approccio già
// usato in /api/admin/monsters/lookup.
async function fetchDetailByComId(bestiaryList, com2usId) {
  const found = bestiaryList.find((m) => m.com2us_id === com2usId);
  if (!found) return null;
  try {
    const res = await fetch(`${SWARFARM_BASE}/api/bestiary/${found.pk}?format=json`, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    return { obtainable: typeof data?.obtainable === "boolean" ? data.obtainable : null };
  } catch {
    return null;
  }
}

// Solo lettura, non tocca NULLA — trova ogni mostro già disambiguato
// ("Nome (ID xxxxx)") nel nostro bestiario sincronizzato, cerca il
// gemello dal nome pulito, e controlla "obtainable" su entrambi per capire
// se quello col nome pulito è davvero quello giusto o no. Nessuna
// decisione automatica: solo un elenco per Flora, da confermare a mano
// uno per uno con "Escludi questo ID".
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Solo Admin." }, { status: 403 });
  }

  const synced = await getSyncedMonsters();
  const alreadyExcluded = new Set(await getNeverCleanIds());
  const dupPattern = / \(ID (\d+)\)$/;
  const pairs = [];
  for (const m of synced) {
    const match = m.name.match(dupPattern);
    if (!match) continue;
    const baseName = m.name.replace(dupPattern, "");
    const clean = synced.find((x) => x.name === baseName);
    if (!clean) continue; // il nome pulito non esiste (raro, ma possibile se anche lui è "2A" o sparito)
    if (alreadyExcluded.has(clean.com2usId)) continue; // già confermato in una sessione precedente — niente da rifare
    pairs.push({ baseName, cleanId: clean.com2usId, dupId: Number(match[1]) });
  }
  if (!pairs.length) return NextResponse.json({ ok: true, candidates: [] });

  const bestiaryRes = await fetch(`${SWARFARM_BASE}/api/bestiary?format=json`, { headers: { Accept: "application/json" } });
  if (!bestiaryRes.ok) return NextResponse.json({ error: `swarfarm risposta ${bestiaryRes.status}` }, { status: 502 });
  const bestiaryList = await bestiaryRes.json();

  const ids = [];
  for (const p of pairs) { ids.push(p.cleanId, p.dupId); }
  const uniqueIds = [...new Set(ids)];
  const detailById = new Map();
  for (let i = 0; i < uniqueIds.length; i += BATCH) {
    const batch = uniqueIds.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((id) => fetchDetailByComId(bestiaryList, id)));
    batch.forEach((id, j) => detailById.set(id, results[j]));
  }

  const candidates = pairs
    .map((p) => {
      const cleanObtainable = detailById.get(p.cleanId)?.obtainable ?? null;
      const dupObtainable = detailById.get(p.dupId)?.obtainable ?? null;
      const suspicious = cleanObtainable === false && dupObtainable === true; // il "pulito" sembra quello sbagliato
      const alreadyCorrect = cleanObtainable === true && dupObtainable === false; // il pulito è già quello giusto
      return { ...p, cleanObtainable, dupObtainable, suspicious, alreadyCorrect };
    })
    // Bug corretto il 07/08/2026 (Flora): mancava proprio questo caso — una
    // coppia già nello stato giusto (pulito obtainable, disambiguato no)
    // veniva comunque rimostrata come "da decidere", con un bottone che se
    // premuto avrebbe RIROTTO quello che era già corretto. Ora se è già a
    // posto sparisce dall'elenco, punto — niente più da fare, niente da
    // poter sbagliare per sbaglio.
    .filter((c) => !c.alreadyCorrect);

  return NextResponse.json({ ok: true, candidates });
}
