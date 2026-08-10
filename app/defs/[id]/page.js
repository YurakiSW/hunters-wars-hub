"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../../../components/Header";
import Modal from "../../../components/Modal";
import ConfirmModal from "../../../components/ConfirmModal";
import CounterForm from "../../../components/CounterForm";
import CounterTemplatePicker from "../../../components/CounterTemplatePicker";
import DefForm from "../../../components/DefForm";
import MonsterCrest from "../../../components/MonsterCrest";
import VideoPreview from "../../../components/VideoPreview";
import LoadingScreen from "../../../components/LoadingScreen";
import { formatNickname, displayAuthorName, counterAuthorLabel } from "../../../lib/textUtils";
import NicknameHeart from "../../../components/NicknameHeart";

export default function DefDetailPage({ params }) {
  const [managerNicknames, setManagerNicknames] = useState([]);
  const [user, setUser] = useState(null);
  const [def, setDef] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [template, setTemplate] = useState(null);
  const [editingCounter, setEditingCounter] = useState(null);
  const [editingDef, setEditingDef] = useState(false);
  const [confirmDeleteCounter, setConfirmDeleteCounter] = useState(null);
  const [confirmDeleteDef, setConfirmDeleteDef] = useState(false);
  const [favoriteCounterIds, setFavoriteCounterIds] = useState(new Set());
  const router = useRouter();

  async function load() {
    const res = await fetch(`/api/defs/${params.id}`);
    const data = await res.json();
    setDef(data.def);
  }

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (!d.user) return router.push("/login");
      if (d.user.status !== "approved") return router.push("/pending");
      setUser(d.user);
      setFavoriteCounterIds(new Set(d.user.favoriteCounterIds || []));
    });
    fetch("/api/managers").then((r) => r.json()).then((d) => setManagerNicknames(d.nicknames || [])).catch(() => {});
    load();
  }, []);

  if (!user || !def) return <LoadingScreen />;
  const canManage = user.role === "admin" || user.role === "reviewer";
  const canManageDecks = user.role === "admin" || user.isDeckBuilder === true;

  async function copyToDeck(counterId) {
    const res = await fetch("/api/decks/from-counter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ counterId }) });
    const data = await res.json();
    if (data.deck) router.push("/deck-build");
    else if (data.error) alert(data.error);
  }

  async function toggleFavoriteCounter(counterId) {
    const res = await fetch("/api/me/favorites", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "counter", id: counterId }),
    });
    const data = await res.json();
    if (res.ok) setFavoriteCounterIds(new Set(data.favoriteCounterIds));
  }

  function formatCounterForDiscord(c) {
    const main = c.units.slice(0, 3);
    const lines = [`⚔️ ${c.offense.join(" / ")}`];
    if (c.lead) lines.push(`👑 Lead: ${c.lead}`);
    lines.push("");
    for (const u of main) {
      const runes = u.statsFlexible ? "Set libero" : u.runes || null;
      const stats = u.statsFlexible ? (u.statsMinText ? `+ ${u.statsMinText}` : null) : u.stats || null;
      const parts = [u.name, runes, stats].filter(Boolean);
      lines.push(parts.join(" — "));
      const cs = u.combatStats;
      if (cs && Object.values(cs).some((v) => v != null)) {
        const bits = [
          cs.hp != null && `HP ${cs.hp}`, cs.atk != null && `ATK ${cs.atk}`, cs.def != null && `DEF ${cs.def}`, cs.spd != null && `SPD ${cs.spd}`,
          cs.critRate != null && `CRI Rate ${cs.critRate}%`, cs.critDmg != null && `CRI Dmg ${cs.critDmg}%`,
          cs.resistance != null && `Resistance ${cs.resistance}%`, cs.accuracy != null && `Accuracy ${cs.accuracy}%`,
        ].filter(Boolean);
        if (bits.length) lines.push(`   ${bits.join(" · ")}`);
      }
    }
    lines.push("");
    lines.push(`🎯 Funziona contro: ${def.monsters.join("/")}`);
    return lines.join("\n");
  }

  async function copyCounterToDiscord(c) {
    const text = formatCounterForDiscord(c);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      alert(`Impossibile copiare in automatico, eccolo:\n\n${text}`);
    }
  }

  async function submitNewCounter(payload) {
    const res = await fetch(`/api/defs/${def.id}/counters`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error };
    setShowForm(false);
    load();
    return {};
  }

  async function submitEditCounter(payload) {
    const res = await fetch(`/api/counters/${editingCounter.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error };
    setEditingCounter(null);
    load();
    return {};
  }

  async function approveCounter(id, status) {
    const patch = status === "pending" ? { status, approvedById: null, approvedByNickname: null } : { status };
    await fetch(`/api/counters/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    load();
  }

  async function deleteCounter(id) {
    await fetch(`/api/counters/${id}`, { method: "DELETE" });
    setConfirmDeleteCounter(null);
    load();
  }

  async function deleteDef() {
    await fetch(`/api/defs/${def.id}`, { method: "DELETE" });
    router.back();
  }

  async function submitEditDef({ m1, m2, m3, desc }) {
    const res = await fetch(`/api/defs/${def.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ m1, m2, m3, desc }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error };
    setEditingDef(false);
    load();
    return {};
  }

  return (
    <div>
      <Header user={user} />
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 20px 60px" }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--text-muted)", fontSize: 13 }}>← Torna alle Difese</button>

        <div style={{ display: "flex", marginTop: 14, marginBottom: 4 }}>
          {def.monsters.map((m, i) => (
            <div key={i} style={{ marginLeft: i === 0 ? 0 : -12, zIndex: 10 - i }}>
              <MonsterCrest name={m} size={54} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h1 className="f-display" style={{ fontSize: 26, margin: "0 0 4px" }}>{def.monsters.join(" / ")}</h1>
          {canManage && (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setEditingDef(true)}>✎ Modifica difesa</button>
              <button className="btn btn-danger" onClick={() => setConfirmDeleteDef(true)}>🗑 Elimina difesa</button>
            </div>
          )}
        </div>
        {def.desc && <p style={{ color: "var(--text-muted)" }}>{def.desc}</p>}

        <div style={{ display: "flex", justifyContent: "space-between", margin: "22px 0 14px", flexWrap: "wrap", gap: 8 }}>
          <div className="section-label">Counter proposti ({def.counters.length})</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setShowTemplatePicker(true)}>📋 Parti da un counter esistente</button>
            <button className="btn btn-primary" onClick={() => { setTemplate(null); setShowForm(true); }}>+ Proponi counter</button>
          </div>
        </div>

        {[...def.counters].sort((a, b) => (favoriteCounterIds.has(b.id) ? 1 : 0) - (favoriteCounterIds.has(a.id) ? 1 : 0)).map((c) => (
          <CounterCard
            canManageDecks={canManageDecks}
            onCopyToDeck={() => copyToDeck(c.id)}
            key={c.id}
            counter={c}
            user={user}
            canManage={canManage}
            managerNicknames={managerNicknames}
            onEdit={() => setEditingCounter(c)}
            onDelete={() => setConfirmDeleteCounter(c)}
            onApprove={() => approveCounter(c.id, "approved")}
            onReject={() => setConfirmDeleteCounter(c)}
            onUnapprove={() => approveCounter(c.id, "pending")}
            isFavorite={favoriteCounterIds.has(c.id)}
            onToggleFavorite={() => toggleFavoriteCounter(c.id)}
            onCopyDiscord={() => copyCounterToDiscord(c)}
          />
        ))}
        {def.counters.length === 0 && <p style={{ color: "var(--text-faint)" }}>Nessun counter ancora per questa difesa.</p>}
      </div>

      {showTemplatePicker && (
        <Modal title="Parti da un counter esistente" onClose={() => setShowTemplatePicker(false)} wide>
          <CounterTemplatePicker
            onClose={() => setShowTemplatePicker(false)}
            onSelect={(sourceCounter) => {
              // Copia tutto tranne id/stato/autore/focus: il Focus riguardava
              // i bersagli DELL'ALTRA difesa, va sempre reimpostato per questa.
              setTemplate({
                units: sourceCounter.units.map((u) => ({ ...u })),
                turnOrder: [...sourceCounter.turnOrder],
                focus: [],
                strategy: sourceCounter.strategy,
                warning: sourceCounter.warning || "",
                video: sourceCounter.video || "",
                images: [],
              });
              setShowTemplatePicker(false);
              setShowForm(true);
            }}
          />
        </Modal>
      )}

      {showForm && (
        <Modal title={`Nuovo counter — ${def.monsters.join(" / ")}`} onClose={() => setShowForm(false)} wide>
          <CounterForm defMonsters={def.monsters} initial={template} onSubmit={submitNewCounter} onCancel={() => setShowForm(false)} />
        </Modal>
      )}
      {editingCounter && (
        <Modal title={`Modifica counter`} onClose={() => setEditingCounter(null)} wide>
          <CounterForm defMonsters={def.monsters} initial={editingCounter} isEdit onSubmit={submitEditCounter} onCancel={() => setEditingCounter(null)} />
        </Modal>
      )}
      {confirmDeleteCounter && (
        <ConfirmModal
          message={`Eliminare il counter ${confirmDeleteCounter.offense.join(" / ")}? Non si può annullare.`}
          onConfirm={() => deleteCounter(confirmDeleteCounter.id)}
          onCancel={() => setConfirmDeleteCounter(null)}
        />
      )}
      {confirmDeleteDef && (
        <ConfirmModal
          message={`Eliminare la difesa ${def.monsters.join(" / ")} e tutti i suoi ${def.counters.length} counter? Non si può annullare.`}
          onConfirm={deleteDef}
          onCancel={() => setConfirmDeleteDef(false)}
        />
      )}
      {editingDef && (
        <Modal title={`Modifica difesa — ${def.monsters.join(" / ")}`} onClose={() => setEditingDef(false)}>
          <DefForm initial={def} onSubmit={submitEditDef} onCancel={() => setEditingDef(false)} />
        </Modal>
      )}
    </div>
  );
}

// Rune/Stat/Artefatti/Note di UN mostro — estratto a parte perché ora si
// usa due volte nella stessa card quando c'è un'alternativa al 3° mostro.
function UnitBuildDetails({ u }) {
  return (
    <>
      <div className="f-mono" style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 2 }}>
        Rune: <span style={{ color: "var(--text)" }}>{u.statsFlexible ? "Set libero" : (u.runes || "—")}</span>
      </div>
      <div className="f-mono" style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8 }}>
        Stat: <span style={{ color: "var(--text)" }}>{u.statsFlexible ? `+ ${u.statsMinText || "—"}` : (u.stats || "—")}</span>
      </div>
      {u.artifactLeft?.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div className="f-mono" style={{ fontSize: 10, color: "var(--text-faint)", textTransform: "uppercase" }}>
            Art. Attributo{u.artifactLeftMainStat ? ` (${u.artifactLeftMainStat})` : ""}
          </div>
          <ol style={{ margin: "2px 0", paddingLeft: 16, fontSize: 11.5 }}>
            {u.artifactLeft.map((a, i) => <li key={i}>{a}</li>)}
          </ol>
        </div>
      )}
      {u.artifactRight?.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div className="f-mono" style={{ fontSize: 10, color: "var(--text-faint)", textTransform: "uppercase" }}>
            Art. Tipo{u.artifactRightMainStat ? ` (${u.artifactRightMainStat})` : ""}
          </div>
          <ol style={{ margin: "2px 0", paddingLeft: 16, fontSize: 11.5 }}>
            {u.artifactRight.map((a, i) => <li key={i}>{a}</li>)}
          </ol>
        </div>
      )}
      {u.relicMainStat && (
        <div className="f-mono" style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 6 }}>
          Relic: <span style={{ color: "var(--text)" }}>{u.relicMainStat}</span>
        </div>
      )}
      {u.combatStats && Object.values(u.combatStats).some((v) => v != null) && (
        <div style={{ marginBottom: 6 }}>
          <div className="f-mono" style={{ fontSize: 10, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 3 }}>Combat Stats</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px 12px", fontSize: 11.5 }}>
            {[
              ["HP", u.combatStats.hp], ["ATK", u.combatStats.atk], ["DEF", u.combatStats.def], ["SPD", u.combatStats.spd],
              ["CRI Rate", u.combatStats.critRate != null ? `${u.combatStats.critRate}%` : null],
              ["CRI Dmg", u.combatStats.critDmg != null ? `${u.combatStats.critDmg}%` : null],
              ["Resistance", u.combatStats.resistance != null ? `${u.combatStats.resistance}%` : null],
              ["Accuracy", u.combatStats.accuracy != null ? `${u.combatStats.accuracy}%` : null],
            ].map(([label, val]) => val != null && (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)" }}>
                <span>{label}</span><span style={{ color: "var(--text)" }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {u.notes?.filter(Boolean).length > 0 && (
        <div>
          <div className="f-mono" style={{ fontSize: 10, color: "var(--text-faint)", textTransform: "uppercase" }}>Note</div>
          <ul style={{ margin: "2px 0", paddingLeft: 16, fontSize: 11.5, color: "var(--text-muted)" }}>
            {u.notes.filter(Boolean).map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      )}
    </>
  );
}

function CounterCard({ counter: c, user, canManage, managerNicknames, onEdit, onDelete, onApprove, onReject, onUnapprove, canManageDecks, onCopyToDeck, isFavorite, onToggleFavorite, onCopyDiscord }) {
  const [open, setOpen] = useState(false);
  const canEdit = canManage || (c.authorId === user.id && c.status === "pending");

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div>
          <span className="f-display" style={{ fontSize: 16 }}>
            {c.offense.join(" · ")}
            {c.units?.[3] && <> / {c.units[3].name}</>}
          </span>{" "}
          <span className={`badge ${c.status === "approved" ? "badge-approved" : "badge-pending"}`}>
            {c.status === "approved" ? "Approvato" : "In attesa"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="f-mono" style={{ fontSize: 11, color: "var(--text-faint)" }}><NicknameHeart isOwn={c.authorId === user.id}>{formatNickname(counterAuthorLabel(c), managerNicknames.includes(c.authorNickname))}</NicknameHeart></span>
          {c.status === "approved" && c.approvedByNickname && c.approvedByNickname !== c.authorNickname && (
            <span className="f-mono" style={{ fontSize: 11, color: "var(--green)" }}>
              · Appr. da <NicknameHeart isOwn={c.approvedById === user.id}>{formatNickname(displayAuthorName(c.approvedByNickname), managerNicknames.includes(c.approvedByNickname))}</NicknameHeart>
            </span>
          )}
          {canEdit && <button className="btn btn-ghost" onClick={onEdit}>✎</button>}
          <button className="btn btn-ghost" title={isFavorite ? "Togli dai preferiti" : "Aggiungi ai preferiti"} onClick={onToggleFavorite} style={{ color: isFavorite ? "var(--gold)" : undefined }}>
            {isFavorite ? "★" : "☆"}
          </button>
          <button className="btn btn-ghost" title="Copia su chat esterna" onClick={onCopyDiscord}>📋</button>
          {canManageDecks && c.status === "approved" && (
            <button className="btn btn-ghost" title="Crea una copia indipendente su ATK Deck" onClick={onCopyToDeck}>⧉ Copia su Deck</button>
          )}
          {c.status === "approved" && (
            <button className="btn btn-ghost" title="Segnala un problema — la rimanda in coda per un ricontrollo" onClick={onUnapprove}>↺ Da rivedere</button>
          )}
          {canManage && <button className="btn btn-ghost" onClick={onDelete}>🗑</button>}
        </div>
      </div>

      <button className="btn btn-ghost" onClick={() => setOpen((o) => !o)}>
        {open ? "Nascondi dettagli ▲" : "Mostra dettagli completi ▼"}
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          <div className="section-label">Squadra</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 14 }}>
            {[...c.units.slice(0, 3)].sort((a, b) => (b.lead ? 1 : 0) - (a.lead ? 1 : 0)).map((u, sortedIdx) => {
              // L'alternativa (c.units[3], se c'è) è sempre legata al 3° mostro
              // inserito (c.units[2]) — a prescindere da dove finisce dopo aver
              // ordinato per lead, non conta come 4° mostro a sé.
              const isThirdSlot = c.units[2] && u.name === c.units[2].name;
              const alt = isThirdSlot ? c.units[3] : null;
              return (
                <div key={u.name + sortedIdx} style={{ background: "var(--bg-soft)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <MonsterCrest name={u.name} size={40} lead={u.lead} />
                    <span className="f-display" style={{ fontSize: 14 }}>{u.name}</span>
                    {alt && (
                      <>
                        <span style={{ color: "var(--text-faint)" }}>/</span>
                        <MonsterCrest name={alt.name} size={40} />
                        <span className="f-display" style={{ fontSize: 14 }}>{alt.name}</span>
                      </>
                    )}
                  </div>
                  <UnitBuildDetails u={u} />
                  {alt && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--border-soft)" }}>
                      <div className="f-mono" style={{ fontSize: 10, color: "var(--gold)", textTransform: "uppercase", marginBottom: 6 }}>In alternativa: {alt.name}</div>
                      <UnitBuildDetails u={alt} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="section-label">Speed Tuning</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 14, overflowX: "auto" }}>
            {c.turnOrder.map((name, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 52 }}>
                  <span className="f-mono" style={{ fontSize: 10, color: "var(--violet)", fontWeight: 700, marginBottom: 2 }}>Turno {i + 1}</span>
                  <MonsterCrest name={name} size={44} lead={name === c.lead} />
                  <span style={{ fontSize: 11, marginTop: 4 }}>{name}</span>
                </div>
                {i < c.turnOrder.length - 1 && <div style={{ width: 18, height: 0, borderTop: "2px dashed var(--border)", marginBottom: 22, alignSelf: "center" }} />}
              </div>
            ))}
          </div>

          {c.focus?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="section-label">Focus priority</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {c.focus.map((m, i) => (
                  <span key={m} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {i > 0 && <span style={{ color: "var(--text-faint)" }}>→</span>}
                    <span style={{ background: "var(--gold-soft)", color: "var(--gold)", padding: "4px 9px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                      <MonsterCrest name={m} size={22} /> {m}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {c.strategy && (
            <div style={{ marginBottom: 12 }}>
              <div className="section-label">Strategia</div>
              <p style={{ fontSize: 13, lineHeight: 1.5 }}>{c.strategy}</p>
            </div>
          )}

          {c.warning && (
            <div style={{ background: "var(--red-soft)", border: "1px solid var(--red)", borderRadius: 8, padding: "8px 12px", color: "var(--red)", fontSize: 12.5, marginBottom: 12 }}>
              ⚠ {c.warning}
            </div>
          )}

          {(c.video || c.images?.length > 0) && (
            <div>
              <div className="section-label">Allegati</div>
              {c.video && <VideoPreview url={c.video} />}
              {c.images?.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: c.video ? 8 : 0 }}>
                  {c.images.map((img, i) => (
                    <img key={i} src={img.dataUrl} alt={img.name} title={img.name} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border-soft)" }} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {canManage && c.status === "pending" && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn btn-green" onClick={onApprove}>✓ Approva</button>
          <button className="btn btn-danger" onClick={onReject}>✕ Rifiuta</button>
        </div>
      )}
    </div>
  );
}
