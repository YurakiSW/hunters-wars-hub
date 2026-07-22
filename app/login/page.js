"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthCard, { AuthField, AuthDivider, AuthSubmitButton } from "../../components/AuthCard";

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
    <AuthCard title="Bentornato">
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
        <div style={{ marginBottom: 16 }}>
          <AuthField icon="✉">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ border: "none", borderRadius: 0, flex: 1 }} />
          </AuthField>
        </div>

        <div className="section-label" style={{ marginBottom: 6 }}>Password</div>
        <div style={{ marginBottom: 8 }}>
          <AuthField
            icon="🔒"
            right={
              <span onClick={() => setShowPassword((s) => !s)} style={{ display: "flex", alignItems: "center", padding: "0 11px", color: "var(--text-faint)", fontSize: 13, cursor: "pointer" }}>
                {showPassword ? "🙈" : "👁"}
              </span>
            }
          >
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ border: "none", borderRadius: 0, flex: 1 }}
            />
          </AuthField>
        </div>

        {error && <p style={{ color: "var(--red)", fontSize: 13, margin: "6px 0 0" }}>{error}</p>}

        <AuthSubmitButton type="submit" disabled={loading}>
          {loading ? "Accesso..." : "✦ Accedi ✦"}
        </AuthSubmitButton>
      </form>

      <AuthDivider />

      <div style={{ display: "flex", gap: 10 }}>
        <a href="/register" className="f-mono" style={{ flex: 1, textAlign: "center", padding: "10px 6px", borderRadius: 8, border: "1px solid var(--border)", color: "var(--gold)", fontSize: 11, letterSpacing: ".04em", textTransform: "uppercase", textDecoration: "none" }}>
          👤+ Crea account
        </a>
        <a href="/forgot-password" className="f-mono" style={{ flex: 1, textAlign: "center", padding: "10px 6px", borderRadius: 8, border: "1px solid var(--border)", color: "var(--gold)", fontSize: 11, letterSpacing: ".04em", textTransform: "uppercase", textDecoration: "none" }}>
          🔒 Password persa
        </a>
      </div>
    </AuthCard>
  );
}
