"use client";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

export default function Modal({ title, onClose, children, wide }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-content ${wide ? "wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h2 className="f-display" style={{ fontSize: 20, margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20 }}>✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
