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
            Unisciti alla Gilda
          </h2>
          <p style={{ textAlign: "center", color: "var(--text-faint)", fontSize: 13, marginBottom: 24 }}>
            Crea il tuo account per il Counter Siege hub
          </p>

          <form onSubmit={handleSubmit}>
            <div className="section-label" style={{ marginBottom: 6 }}>Nickname in game</div>
            <div style={{ position: "relative", marginBottom: 16 }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--gold)", fontSize: 14 }}>🐺</span>
              <input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} required style={{ paddingLeft: 34 }} />
            </div>

            <div className="section-label" style={{ marginBottom: 6 }}>Email</div>
            <div style={{ position: "relative", marginBottom: 16 }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--gold)", fontSize: 14 }}>✉</span>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required style={{ paddingLeft: 34 }} />
            </div>

            <div className="section-label" style={{ marginBottom: 6 }}>Password</div>
            <div style={{ position: "relative", marginBottom: 22 }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--gold)", fontSize: 14 }}>🔒</span>
              <input
                type={showPassword ? "text" : "password"}
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
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
