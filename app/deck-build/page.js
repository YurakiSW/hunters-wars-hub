"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../../components/Header";
import Modal from "../../components/Modal";
import ConfirmModal from "../../components/ConfirmModal";
import CounterForm from "../../components/CounterForm";
import AgainstDefPicker from "../../components/AgainstDefPicker";
import MonsterCrest from "../../components/MonsterCrest";
import { formatNickname } from "../../lib/textUtils";
import Sticker from "../../components/Sticker";
import NicknameHeart from "../../components/NicknameHeart";

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

function DeckRow({
  deck, user, canManage, open, onToggleOpen, selected, onToggleSelect,
  onEdit, onDelete, onDuplicate, onAddAgainst, onRemoveAgainst,
  reorderMode, onMoveUp, onMoveDown, isFirst, isLast,
}) {
  const targetCount = deck.against?.length || 0;
  return (
    <div className="card" style={{ marginBottom: 10, borderColor: open ? "var(--gold)" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {canManage && !reorderMode && (
          <input type="checkbox" checked={selected} onChange={onToggleSelect} style={{ width: 16, height: 16, flexShrink: 0 }} />
        )}
        {reorderMode && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <button className="btn btn-ghost" style={{ padding: "1px 6px", fontSize: 11 }} disabled={isFirst} onClick={onMoveUp}>▲</button>
            <button className="btn btn-ghost" style={{ padding: "1px 6px", fontSize: 11 }} disabled={isLast} onClick={onMoveDown}>▼</button>
          </div>
        )}
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {deck.units.slice(0, 3).map((u, i) => (
            <MonsterCrest key={i} name={u.name} size={38} square lead={u.lead} />
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="f-display" style={{ fontSize: 14 }}>{deck.units.slice(0, 3).map((u) => u.name).join(" / ")}</span>
            <span className="badge" style={{ background: "var(--violet-soft)", color: "var(--violet)" }}>{deck.buildLabel}</span>
            {targetCount > 0 && (
              <span className="f-mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>{targetCount} difes{targetCount === 1 ? "a" : "e"}</span>
            )}
          </div>
          <p className="f-mono" style={{ fontSize: 11, color: "var(--text-faint)", margin: "2px 0 0" }}>
            Deck by <NicknameHeart>{formatNickname(deck.authorNickname)}</NicknameHeart>
          </p>
        </div>
        {!reorderMode && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn btn-ghost" onClick={onToggleOpen}>{open ? "Nascondi dettagli ▲" : "Mostra dettagli completi ▼"}</button>
            {canManage && <button className="btn btn-ghost" onClick={onEdit}>✎</button>}
            {canManage && <button className="btn btn-ghost" onClick={onDuplicate}>⧉</button>}
            {canManage && <button className="btn btn-danger" onClick={onDelete}>🗑</button>}
          </div>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          <div className="section-label">Squadra</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 14 }}>
            {deck.units.slice(0, 3).map((u, i) => (
              <div key={i} style={{ background: "var(--bg-soft)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <MonsterCrest name={u.name} size={40} square lead={u.lead} />
                  <span className="f-display" style={{ fontSize: 14 }}>{u.name}</span>
                </div>
                <UnitBuildDetails u={u} />
              </div>
            ))}
            {deck.units[3] && (
              <div style={{ background: "var(--bg-soft)", border: "1px dashed var(--gold)", borderRadius: 10, padding: 12 }}>
                <div className="f-mono" style={{ fontSize: 10, color: "var(--gold)", textTransform: "uppercase", marginBottom: 8 }}>
                  In alternativa: {deck.units[3].name}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <MonsterCrest name={deck.units[3].name} size={40} square />
                  <span className="f-display" style={{ fontSize: 14 }}>{deck.units[3].name}</span>
                </div>
                <UnitBuildDetails u={deck.units[3]} />
              </div>
            )}
          </div>

          {deck.turnOrder?.length > 0 && (
            <>
              <div className="section-label">Speed Tuning</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 14, overflowX: "auto" }}>
                {deck.turnOrder.map((name, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 52 }}>
                      <span className="f-mono" style={{ fontSize: 10, color: "var(--violet)", fontWeight: 700, marginBottom: 2 }}>Turno {i + 1}</span>
                      <MonsterCrest name={name} size={44} square lead={deck.units.find((u) => u.name === name)?.lead} />
                      <span style={{ fontSize: 11, marginTop: 4 }}>{name}</span>
                    </div>
                    {i < deck.turnOrder.length - 1 && <div style={{ width: 18, height: 0, borderTop: "2px dashed var(--border)", marginBottom: 22, alignSelf: "center" }} />}
                  </div>
                ))}
              </div>
            </>
          )}

          {deck.strategy && (
            <div style={{ marginBottom: 12 }}>
              <div className="section-label">Strategia</div>
              <p style={{ fontSize: 13, lineHeight: 1.5 }}>{deck.strategy}</p>
            </div>
          )}

          {deck.warning && (
            <div style={{ background: "var(--red-soft)", border: "1px solid var(--red)", borderRadius: 8, padding: "8px 12px", color: "var(--red)", fontSize: 12.5, marginBottom: 12 }}>
              ⚠ {deck.warning}
            </div>
          )}

          <div className="section-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            Da usare contro
            {canManage && <button className="btn btn-gold" style={{ padding: "3px 10px", fontSize: 11.5 }} onClick={onAddAgainst}>+ Aggiungi difesa</button>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {(deck.against || []).map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-soft)", border: "1px solid var(--border-soft)", borderRadius: 8, padding: "6px 10px" }}>
                <div style={{ display: "flex", gap: 3 }}>
                  {a.monsters.map((m, i) => <MonsterCrest key={i} name={m} size={24} square lead={i === 0} />)}
                </div>
                <span style={{ flex: 1, fontSize: 12.5 }}>{a.monsters.join(" / ")}</span>
                {canManage && (
                  <button onClick={() => onRemoveAgainst(a.id)} style={{ background: "none", border: "none", color: "var(--red)", fontSize: 15, cursor: "pointer" }}>✕</button>
                )}
              </div>
            ))}
            {!(deck.against || []).length && <p style={{ color: "var(--text-faint)", fontSize: 12.5 }}>Nessuna difesa collegata.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DeckBuildPage() {
  const [user, setUser] = useState(null);
  const [decks, setDecks] = useState([]);
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [reorderMode, setReorderMode] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingDeck, setEditingDeck] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [addingAgainstTo, setAddingAgainstTo] = useState(null);
  const [error, setError] = useState("");
  const [celebration, setCelebration] = useState(null); // "felice" | "trombetta" | null
  const router = useRouter();

  async function load() {
    const res = await fetch("/api/decks");
    const data = await res.json();
    setDecks(data.decks || []);
  }

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (!d.user) return router.push("/login");
      if (d.user.status !== "approved") return router.push("/pending");
      setUser(d.user);
    });
    load();
  }, []);

  if (!user) return null;
  const canManage = user.role === "admin" || user.isDeckBuilder === true;

  const qTokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = qTokens.length
    ? decks.filter((d) => qTokens.every((t) => d.units.slice(0, 3).some((u) => u.name.toLowerCase().includes(t))))
    : decks;

  function toggleOpen(id) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submitNewDeck(payload) {
    const res = await fetch("/api/decks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (data.deck) {
      setShowNewForm(false);
      load();
      // Traguardo silenzioso: al deck "tondo" (50°, 100°...) festeggia con
      // la trombetta invece del solito felice — mai annunciato, si scopre
      // da sola. decks.length è ancora il conteggio PRIMA di questo nuovo.
      const newCount = decks.length + 1;
      setCelebration(newCount % 50 === 0 ? "trombetta" : "felice");
      setTimeout(() => setCelebration(null), 2600);
    }
    return data;
  }
  async function submitEditDeck(payload) {
    const res = await fetch(`/api/decks/${editingDeck.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (data.deck) { setEditingDeck(null); load(); }
    return data;
  }
  async function deleteDeck(id) {
    await fetch(`/api/decks/${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    load();
  }
  async function bulkDelete() {
    await fetch("/api/decks/bulk-delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...selectedIds] }) });
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
    load();
  }
  async function duplicateDeck(id) {
    await fetch(`/api/decks/${id}/duplicate`, { method: "POST" });
    load();
  }
  async function addAgainst(deckId, monsters) {
    await fetch(`/api/decks/${deckId}/against`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monsters }) });
    setAddingAgainstTo(null);
    load();
  }
  async function removeAgainst(deckId, entryId) {
    await fetch(`/api/decks/${deckId}/against/${entryId}`, { method: "DELETE" });
    load();
  }
  async function move(id, dir) {
    const idx = decks.findIndex((d) => d.id === id);
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= decks.length) return;
    const next = [...decks];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    setDecks(next);
    await fetch("/api/decks/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderedIds: next.map((d) => d.id) }) });
  }

  return (
    <div>
      <Header user={user} />
      {celebration && (
        <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 50, background: "var(--bg-soft, #1b1630)", border: "1px solid var(--gold)", borderRadius: 12, padding: "8px 14px 8px 8px", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}>
          <Sticker name={celebration} revealOnClick={celebration === "felice" ? "nonoPokerface" : undefined} revealCount={6} size={52} />
          <span style={{ fontSize: 12.5, color: "var(--text)" }}>{celebration === "trombetta" ? "Bel traguardo! 🎉" : "Deck creato!"}</span>
        </div>
      )}
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <h1 className="f-display" style={{ fontSize: 22, margin: 0 }}>ATK Deck</h1>
          {canManage && (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setReorderMode((r) => !r)}>{reorderMode ? "Fine riordino" : "Riordina"}</button>
              <button className="btn btn-primary" onClick={() => setShowNewForm(true)}>+ Nuovo deck</button>
            </div>
          )}
        </div>

        <input placeholder="Cerca per mostro..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: 320, marginBottom: 14 }} />

        {canManage && selectedIds.size > 0 && !reorderMode && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--violet-soft)", border: "1px solid var(--violet)", borderRadius: 10, padding: "8px 12px", marginBottom: 12 }}>
            <span style={{ fontSize: 12.5, color: "var(--violet)" }}>{selectedIds.size} deck selezionat{selectedIds.size === 1 ? "o" : "i"}</span>
            <button className="btn btn-danger" onClick={() => setConfirmBulkDelete(true)}>Elimina selezionati</button>
          </div>
        )}

        {filtered.map((deck) => (
          <DeckRow
            key={deck.id}
            deck={deck}
            user={user}
            canManage={canManage}
            open={openIds.has(deck.id)}
            onToggleOpen={() => toggleOpen(deck.id)}
            selected={selectedIds.has(deck.id)}
            onToggleSelect={() => toggleSelect(deck.id)}
            onEdit={() => setEditingDeck(deck)}
            onDelete={() => setConfirmDelete(deck)}
            onDuplicate={() => duplicateDeck(deck.id)}
            onAddAgainst={() => setAddingAgainstTo(deck.id)}
            onRemoveAgainst={(entryId) => removeAgainst(deck.id, entryId)}
            reorderMode={reorderMode}
            onMoveUp={() => move(deck.id, -1)}
            onMoveDown={() => move(deck.id, 1)}
            isFirst={decks.findIndex((d) => d.id === deck.id) === 0}
            isLast={decks.findIndex((d) => d.id === deck.id) === decks.length - 1}
          />
        ))}
        {!filtered.length && (
          <div style={{ textAlign: "center", marginTop: 30, color: "var(--text-faint)" }}>
            <Sticker name="depresso" revealOnClick="emozionato" size={72} style={{ margin: "0 auto 8px" }} />
            <p>Nessun deck trovato.</p>
          </div>
        )}
      </div>

      {showNewForm && (
        <Modal title="Nuovo deck" onClose={() => setShowNewForm(false)} wide>
          <CounterForm noApprovalFlow submitLabel="Crea deck" onSubmit={submitNewDeck} onCancel={() => setShowNewForm(false)} />
        </Modal>
      )}
      {editingDeck && (
        <Modal title="Modifica deck" onClose={() => setEditingDeck(null)} wide>
          <CounterForm
            isEdit
            noApprovalFlow
            submitLabel="Salva modifiche"
            initial={editingDeck}
            onSubmit={submitEditDeck}
            onCancel={() => setEditingDeck(null)}
          />
        </Modal>
      )}
      {confirmDelete && (
        <ConfirmModal
          message={`Eliminare il deck ${confirmDelete.units.slice(0, 3).map((u) => u.name).join(" / ")}? Non si può annullare.`}
          onConfirm={() => deleteDeck(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {confirmBulkDelete && (
        <ConfirmModal
          message={`Eliminare ${selectedIds.size} deck selezionati? Non si può annullare.`}
          onConfirm={bulkDelete}
          onCancel={() => setConfirmBulkDelete(false)}
        />
      )}
      {addingAgainstTo && (
        <Modal title="Aggiungi difesa a Da usare contro" onClose={() => setAddingAgainstTo(null)}>
          <AgainstDefPicker onSelect={(monsters) => addAgainst(addingAgainstTo, monsters)} onCancel={() => setAddingAgainstTo(null)} />
        </Modal>
      )}
    </div>
  );
}
