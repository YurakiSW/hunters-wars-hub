import { NextResponse } from "next/server";
import { getCurrentUser, canManage } from "../../../../../lib/auth";
import { listProposals, countProposalsByStatus, approveProposal, rejectProposal, purgePendingBelowThreshold, dismissUnderperforming, unpublishProposal, deleteProposal } from "../../../../../lib/siegeStats";
import { safeJson } from "../../../../../lib/apiUtils";

export async function GET(request) {
  const user = await getCurrentUser();
  if (!user || !canManage(user)) {
    return NextResponse.json({ error: "Solo Admin e Revisori possono vedere le proposal." }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  // ?counts=1 -> solo i numeretti per i tab, leggero (niente build decodificate)
  if (searchParams.get("counts") === "1") {
    const counts = await countProposalsByStatus();
    return NextResponse.json({ ok: true, counts });
  }
  const status = searchParams.get("status") || undefined; // pending | approved | rejected | update_available | underperforming
  const proposals = await listProposals(status);
  return NextResponse.json({ ok: true, proposals });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !canManage(user)) {
    return NextResponse.json({ error: "Solo Admin e Revisori possono approvare/rifiutare." }, { status: 403 });
  }
  const { data, error: parseError } = await safeJson(request);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });

  if (data.action === "purge_below_threshold") {
    try {
      const result = await purgePendingBelowThreshold();
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      return NextResponse.json({ error: String(err.message || err) }, { status: 400 });
    }
  }

  const { defK, counterK, action, override } = data;
  if (!defK || !counterK || !["approve", "reject", "dismiss", "unpublish", "delete_proposal"].includes(action)) {
    return NextResponse.json({ error: "Parametri mancanti o azione non valida." }, { status: 400 });
  }

  try {
    if (action === "approve") {
      const { def, counter } = await approveProposal(defK, counterK, { authorId: user.id, authorNickname: user.nickname }, override);
      return NextResponse.json({ ok: true, defId: def.id, counterId: counter.id });
    } else if (action === "reject") {
      await rejectProposal(defK, counterK);
      return NextResponse.json({ ok: true });
    } else if (action === "dismiss") {
      await dismissUnderperforming(defK, counterK);
      return NextResponse.json({ ok: true });
    } else if (action === "unpublish") {
      await unpublishProposal(defK, counterK);
      return NextResponse.json({ ok: true });
    } else {
      await deleteProposal(defK, counterK);
      return NextResponse.json({ ok: true });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 400 });
  }
}
