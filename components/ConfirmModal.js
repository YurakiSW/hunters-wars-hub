"use client";
import Modal from "./Modal";

export default function ConfirmModal({ message, confirmLabel = "Elimina", onConfirm, onCancel }) {
  return (
    <Modal title="Conferma eliminazione" onClose={onCancel}>
      <p style={{ color: "var(--text-muted)", fontSize: 13.5, lineHeight: 1.5, marginBottom: 18 }}>{message}</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-danger" onClick={onConfirm}>🗑 {confirmLabel}</button>
        <button className="btn btn-ghost" onClick={onCancel}>Annulla</button>
      </div>
    </Modal>
  );
}
