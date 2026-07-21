"use client";
import { useRouter } from "next/navigation";

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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a href="/defs" className="btn btn-ghost">Difese</a>
          <a href="/mine" className="btn btn-ghost">📋 Le mie proposte</a>
          {canManage && <a href="/admin" className="btn btn-ghost">⚙ Pannello {user.role === "admin" ? "Admin" : "Gestione"}</a>}
          <span className="f-mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>{user?.nickname}</span>
          <button className="btn btn-ghost" onClick={logout}>Esci</button>
        </div>
      </div>
    </div>
  );
}
