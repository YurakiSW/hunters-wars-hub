"use client";
import { useRouter } from "next/navigation";

function NavPill({ href, icon, children, accent = "gold", external, onClick }) {
  const colors = {
    gold: { border: "var(--gold)", text: "var(--gold)", glow: "rgba(211,169,79,.28)" },
    violet: { border: "var(--violet)", text: "var(--violet)", glow: "rgba(147,118,242,.28)" },
    ember: { border: "var(--ember)", text: "var(--ember)", glow: "rgba(255,106,53,.28)" },
    red: { border: "var(--red)", text: "var(--red)", glow: "rgba(216,72,82,.28)" },
  }[accent];

  const Tag = href ? "a" : "button";
  return (
    <Tag
      href={href}
      onClick={onClick}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 14px 7px 8px",
        borderRadius: 999,
        border: `1px solid ${colors.border}`,
        background: "rgba(255,255,255,.02)",
        color: colors.text,
        textDecoration: "none",
        fontFamily: "'Cinzel', serif",
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: ".01em",
        cursor: "pointer",
        transition: "box-shadow .15s, transform .1s",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 0 14px 1px ${colors.glow}`; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
    >
      <span
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 22, height: 22, borderRadius: "50%",
          background: colors.glow, fontSize: 12, flexShrink: 0,
        }}
      >
        {icon}
      </span>
      {children}
    </Tag>
  );
}

export default function Header({ user }) {
  const router = useRouter();
  const canManage = user?.role === "admin" || user?.role === "reviewer" || user?.canUploadRoster;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div style={{ borderBottom: "1px solid var(--border-soft)", background: "var(--bg-soft)" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <a href="/defs" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
          <img
            src="/logo.jpg"
            alt="Hunters Nux"
            style={{ width: 46, height: 46, borderRadius: "9999px", border: "1.5px solid var(--gold)", boxShadow: "0 0 18px 2px rgba(255,106,53,.35)" }}
          />
          <div>
            <div className="f-mono" style={{ color: "var(--text-faint)", fontSize: 10.5, letterSpacing: ".18em", textTransform: "uppercase" }}>Hunters Wars</div>
            <h1 className="f-hero" style={{ fontSize: 20, margin: "1px 0 0", color: "var(--gold)" }}>Counter Siege</h1>
          </div>
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <NavPill href="/defs" icon="⚔" accent="gold">Difese</NavPill>
          <NavPill href="/mine" icon="📋" accent="violet">Le mie proposte</NavPill>
          {canManage && (
            <NavPill href="/admin" icon="⚙" accent="ember">Pannello {user.role === "admin" ? "Admin" : "Gestione"}</NavPill>
          )}
          <NavPill href="https://sw-guild-site.vercel.app" icon="🎁" accent="gold" external>Redeem codici</NavPill>
          <span className="f-mono" style={{ fontSize: 11, color: "var(--text-faint)", marginLeft: 4 }}>{user?.nickname}</span>
          <NavPill icon="↪" accent="red" onClick={logout}>Esci</NavPill>
        </div>
      </div>
    </div>
  );
}
