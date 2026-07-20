import { NextResponse } from "next/server";
import { getCurrentUser, canManage } from "../../../../lib/auth";
import { getFullMonsterList, getManualMonsters, addManualMonster, removeManualMonster } from "../../../../lib/monsters";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("manualOnly") === "1") {
    const manual = await getManualMonsters();
    return NextResponse.json({ manual });
  }
  const list = await getFullMonsterList();
  return NextResponse.json({ monsters: list });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !canManage(user)) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 403 });
  }
  const { name, iconUrl } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: "Nome mancante." }, { status: 400 });
  const list = await addManualMonster({ name, iconUrl, addedBy: user.nickname });
  return NextResponse.json({ manual: list });
}

export async function DELETE(request) {
  const user = await getCurrentUser();
  if (!user || !canManage(user)) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 403 });
  }
  const { name } = await request.json();
  const list = await removeManualMonster(name);
  return NextResponse.json({ manual: list });
}
