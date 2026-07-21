"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

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
          <h2 className="f-display" style={{ fontSize: 26, textAlign: "center", color: "var(--text)", margin: "0 0 4px" }}>
            Unisciti alla Gilda
          </h2>
          <p style={{ textAlign: "center", color: "var(--text-faint)", fontSize: 13, marginBottom: 24 }}>
            Crea il tuo account per il Counter Siege hub
          </p>

          <form onSubmit={handleSubmit}>
            <div className="section-label" style={{ marginBottom: 6 }}>Nickname in game</div>
            <div style={{ display: "flex", alignItems: "stretch", marginBottom: 16, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <span style={{ display: "flex", alignItems: "center", padding: "0 11px", background: "var(--bg-soft)", borderRight: "1px solid var(--border)", color: "var(--gold)", fontSize: 14 }}>🐺</span>
              <input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} required style={{ border: "none", borderRadius: 0, flex: 1 }} />
            </div>

            <div className="section-label" style={{ marginBottom: 6 }}>Email</div>
            <div style={{ display: "flex", alignItems: "stretch", marginBottom: 16, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <span style={{ display: "flex", alignItems: "center", padding: "0 11px", background: "var(--bg-soft)", borderRight: "1px solid var(--border)", color: "var(--gold)", fontSize: 14 }}>✉</span>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required style={{ border: "none", borderRadius: 0, flex: 1 }} />
            </div>

            <div className="section-label" style={{ marginBottom: 6 }}>Password</div>
            <div style={{ display: "flex", alignItems: "stretch", marginBottom: 8, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <span style={{ display: "flex", alignItems: "center", padding: "0 11px", background: "var(--bg-soft)", borderRight: "1px solid var(--border)", color: "var(--gold)", fontSize: 14 }}>🔒</span>
              <input
                type={showPassword ? "text" : "password"}
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
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

            {error && <p style={{ color: "var(--red)", fontSize: 13, margin: "6px 0 0" }}>{error}</p>}

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
              {loading ? "Creazione..." : "✦ Registrati ✦"}
            </button>
          </form>

          <div style={{ textAlign: "center", color: "var(--border)", fontSize: 11, margin: "22px 0 14px" }}>✦</div>

          <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
            Hai già un account? <a href="/login" style={{ color: "var(--violet)" }}>Accedi</a>
          </p>
        </div>
      </div>
    </div>
  );
}
