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
      <div style={{ width: "100%", maxWidth: 400 }}>
        <h1 className="f-hero" style={{ fontSize: 40, textAlign: "center", color: "var(--gold)", textShadow: "0 0 24px rgba(211,169,79,.45)", marginBottom: 4 }}>
          Hunters Wars
        </h1>
        <div style={{ textAlign: "center", color: "var(--border)", fontSize: 12, marginBottom: 28 }}>✦ · ✦ · ✦</div>

        <div
          style={{
            border: "1.5px solid var(--gold)",
            borderRadius: 18,
            padding: "32px 28px",
            background: "linear-gradient(180deg, rgba(211,169,79,.06), transparent 40%), var(--surface)",
            boxShadow: "0 0 40px -6px rgba(211,169,79,.25), inset 0 0 30px -10px rgba(211,169,79,.12)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <img
              src="/logo.jpg"
              alt="Hunters Nux"
              style={{ width: 84, height: 84, borderRadius: "9999px", border: "2px solid var(--gold)", boxShadow: "0 0 30px 4px rgba(255,106,53,.4)" }}
            />
          </div>
          <h2 className="f-display" style={{ fontSize: 22, textAlign: "center", color: "var(--text)", margin: "0 0 4px" }}>
            Bentornato
          </h2>
          <p style={{ textAlign: "center", color: "var(--text-faint)", fontSize: 13, marginBottom: 24 }}>
            Accedi al Counter Siege hub
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
              <label className="f-mono" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-muted)", cursor: "pointer" }}>
                <input type="checkbox" checked={rememberEmail} onChange={(e) => setRememberEmail(e.target.checked)} />
                Ricorda email
              </label>
              <label className="f-mono" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-muted)", cursor: "pointer" }}>
                <input type="checkbox" checked={keepSignedIn} onChange={(e) => setKeepSignedIn(e.target.checked)} />
                Resta connesso
              </label>
            </div>

            <div className="section-label" style={{ marginBottom: 6 }}>Email</div>
            <div style={{ position: "relative", marginBottom: 16 }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--gold)", fontSize: 14 }}>✉</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ paddingLeft: 34 }} />
            </div>

            <div className="section-label" style={{ marginBottom: 6 }}>Password</div>
            <div style={{ position: "relative", marginBottom: 22 }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--gold)", fontSize: 14 }}>🔒</span>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ paddingLeft: 34, paddingRight: 34 }}
              />
              <span
                onClick={() => setShowPassword((s) => !s)}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)", fontSize: 13, cursor: "pointer" }}
              >
                {showPassword ? "🙈" : "👁"}
              </span>
            </div>
            <p style={{ textAlign: "right", marginTop: -14, marginBottom: 18 }}>
              <a href="/forgot-password" style={{ color: "var(--text-faint)", fontSize: 12 }}>Password dimenticata?</a>
            </p>

            {error && <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 14 }}>{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="f-display"
              style={{
                width: "100%", padding: "12px 0", borderRadius: 10, border: "1px solid var(--gold)",
                background: "linear-gradient(180deg, #e6c874, var(--gold))",
                color: "#1a1408", fontSize: 15, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase",
                cursor: "pointer", boxShadow: "0 4px 16px -4px rgba(211,169,79,.5)",
              }}
            >
              {loading ? "Accesso..." : "✦ Accedi ✦"}
            </button>
          </form>

          <div style={{ textAlign: "center", color: "var(--border)", fontSize: 11, margin: "22px 0 14px" }}>✦</div>

          <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
            Non hai un account? <a href="/register" style={{ color: "var(--violet)" }}>Registrati</a>
          </p>
        </div>
      </div>
    </div>
  );
}
