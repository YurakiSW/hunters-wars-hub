"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthCard, { AuthField, AuthDivider, AuthSubmitButton } from "../../components/AuthCard";

export default function RegisterPage() {
  const [form, setForm] = useState({ email: "", password: "", nickname: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return setError(data.error || "Errore di registrazione.");
    router.push(data.matchedRoster ? "/defs" : "/pending");
    router.refresh();
  }

  return (
    <AuthCard title="Unisciti alla Gilda">
      <p style={{ textAlign: "center", color: "var(--text-faint)", fontSize: 13, marginBottom: 24 }}>
        Crea il tuo account per il Counter Siege hub
      </p>

      <form onSubmit={handleSubmit}>
        <div className="section-label" style={{ marginBottom: 6 }}>Nickname in game</div>
        <div style={{ marginBottom: 16 }}>
          <AuthField icon="🐺">
            <input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} required style={{ border: "none", borderRadius: 0, flex: 1 }} />
          </AuthField>
        </div>

        <div className="section-label" style={{ marginBottom: 6 }}>Email</div>
        <div style={{ marginBottom: 16 }}>
          <AuthField icon="✉">
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required style={{ border: "none", borderRadius: 0, flex: 1 }} />
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
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              style={{ border: "none", borderRadius: 0, flex: 1 }}
            />
          </AuthField>
        </div>

        {error && <p style={{ color: "var(--red)", fontSize: 13, margin: "6px 0 0" }}>{error}</p>}

        <AuthSubmitButton type="submit" disabled={loading}>
          {loading ? "Creazione..." : "✦ Registrati ✦"}
        </AuthSubmitButton>
      </form>

      <AuthDivider />

      <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
        Hai già un account? <a href="/login" style={{ color: "var(--violet)" }}>Accedi</a>
      </p>
    </AuthCard>
  );
}
