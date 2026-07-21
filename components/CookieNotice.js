"use client";
import { useEffect, useState } from "react";

const STORAGE_KEY = "hwh_cookie_notice_dismissed";

export default function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // Se il browser blocca localStorage (modalità privata rigida ecc.),
      // mostriamo comunque l'avviso una volta per sessione, non è grave.
      setVisible(true);
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed", bottom: 16, left: 16, right: 16, zIndex: 999,
        maxWidth: 640, margin: "0 auto",
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
        padding: "14px 16px", boxShadow: "0 8px 30px rgba(0,0,0,.4)",
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
      }}
    >
      <p style={{ flex: 1, minWidth: 220, fontSize: 12.5, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
        🍪 Questo sito usa un cookie tecnico per tenerti collegata/o (nessuna pubblicità o tracciamento), e — solo se
        lo attivi tu — salva l'email nel browser per "Ricorda email".
      </p>
      <button className="btn btn-gold" style={{ padding: "6px 16px", flexShrink: 0 }} onClick={dismiss}>
        Ho capito
      </button>
    </div>
  );
}
