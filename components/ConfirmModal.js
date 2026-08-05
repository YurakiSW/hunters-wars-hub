"use client";
import Modal from "./Modal";
import Sticker from "./Sticker";

export default function ConfirmModal({ message, confirmLabel = "Elimina", onConfirm, onCancel }) {
  return (
    <Modal title="Conferma eliminazione" onClose={onCancel}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 18 }}>
        <Sticker name="sudaSconvolto" size={48} style={{ flexShrink: 0 }} />
        <p style={{ color: "var(--text-muted)", fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-line", margin: 0 }}>{message}</p>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-danger" onClick={onConfirm}>🗑 {confirmLabel}</button>
        <button className="btn btn-ghost" onClick={onCancel}>Annulla</button>
      </div>
    </Modal>
  );
}

