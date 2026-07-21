"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const REMEMBER_KEY = "hwh_remembered_email";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(true);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) setEmail(saved);
      else setRememberEmail(false);
    } catch {}
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, keepSignedIn }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return setError(data.error || "Errore di accesso.");
    try {
      if (rememberEmail) localStorage.setItem(REMEMBER_KEY, email);
      else localStorage.removeItem(REMEMBER_KEY);
    } catch {}
    router.push("/defs");
    router.refresh();
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "6vh 20px" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <h1 className="f-hero" style={{ fontSize: 44, textAlign: "center", color: "var(--gold)", textShadow: "0 0 26px rgba(211,169,79,.5)", marginBottom: 4 }}>
          Hunters Wars
        </h1>
        <div style={{ textAlign: "center", color: "var(--gold)", fontSize: 12, marginBottom: 28, opacity: 0.6 }}>✦ · ✦ · ✦</div>

        <div
          style={{
            border: "1.5px solid var(--gold)",
            borderRadius: 18,
            padding: "34px 30px",
            background: "linear-gradient(180deg, rgba(211,169,79,.07), transparent 40%), var(--surface)",
            boxShadow: "0 0 46px -6px rgba(211,169,79,.28), inset 0 0 30px -10px rgba(211,169,79,.14)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
            <img
              src="/logo.jpg"
              alt="Hunters Nux"
              style={{ width: 116, height: 116, borderRadius: "9999px", border: "2px solid var(--gold)", boxShadow: "0 0 40px 6px rgba(255,106,53,.4)" }}
            />
          </div>
          <h2 className="f-display" style={{ fontSize: 26, textAlign: "center", color: "var(--gold)", margin: "0 0 4px" }}>
            Bentornato
          </h2>
          <p style={{ textAlign: "center", color: "var(--text-faint)", fontSize: 13, marginBottom: 20 }}>
            Accedi al Counter Siege hub
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 20, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
                <input type="checkbox" checked={rememberEmail} onChange={(e) => setRememberEmail(e.target.checked)} style={{ accentColor: "var(--violet)" }} />
                Ricorda email
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
                <input type="checkbox" checked={keepSignedIn} onChange={(e) => setKeepSignedIn(e.target.checked)} style={{ accentColor: "var(--gold)" }} />
                Resta connesso
              </label>
            </div>

            <div className="section-label" style={{ marginBottom: 6 }}>Email</div>
            <div style={{ display: "flex", alignItems: "stretch", marginBottom: 16, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <span style={{ display: "flex", alignItems: "center", padding: "0 11px", background: "var(--bg-soft)", borderRight: "1px solid var(--border)", color: "var(--gold)", fontSize: 14 }}>✉</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ border: "none", borderRadius: 0 }} />
            </div>

            <div className="section-label" style={{ marginBottom: 6 }}>Password</div>
            <div style={{ display: "flex", alignItems: "stretch", marginBottom: 8, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <span style={{ display: "flex", alignItems: "center", padding: "0 11px", background: "var(--bg-soft)", borderRight: "1px solid var(--border)", color: "var(--gold)", fontSize: 14 }}>🔒</span>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ border: "none", borderRadius: 0, flex: 1 }}
              />
              <span
                onClick={() => setShowPassword((s) => !s)}
                style={{ display: "flex", alignItems: "center", padding: "0 11px", color: "var(--text-faint)", fontSize: 13, cursor: "pointer" }}
              >
                {showPassword ? "🙈" : "👁"}
              </span>
            </div>

            {error && <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 14 }}>{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="f-display"
              style={{
                width: "100%", padding: "13px 0", borderRadius: 10, border: "1px solid var(--gold)",
                background: "linear-gradient(180deg, #e6c874, var(--gold))",
                color: "#1a1408", fontSize: 15, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase",
                cursor: "pointer", boxShadow: "0 4px 16px -4px rgba(211,169,79,.5)", marginTop: 14,
              }}
            >
              {loading ? "Accesso..." : "✦ Accedi ✦"}
            </button>
          </form>

          <div style={{ textAlign: "center", color: "var(--border)", fontSize: 11, margin: "22px 0 14px" }}>✦</div>

          <div style={{ display: "flex", gap: 10 }}>
            <a
              href="/register"
              className="f-mono"
              style={{
                flex: 1, textAlign: "center", padding: "10px 6px", borderRadius: 8, border: "1px solid var(--border)",
                color: "var(--gold)", fontSize: 11, letterSpacing: ".04em", textTransform: "uppercase", textDecoration: "none",
              }}
            >
              👤+ Crea account
            </a>
            <a
              href="/forgot-password"
              className="f-mono"
              style={{
                flex: 1, textAlign: "center", padding: "10px 6px", borderRadius: 8, border: "1px solid var(--border)",
                color: "var(--gold)", fontSize: 11, letterSpacing: ".04em", textTransform: "uppercase", textDecoration: "none",
              }}
            >
              🔒 Password persa
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
