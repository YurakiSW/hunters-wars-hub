"use client";
import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return setError(data.error || "Errore.");
    setDone(true);
    setTimeout(() => router.push("/login"), 2000);
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
            Nuova password
          </h2>

          {!token ? (
            <p style={{ textAlign: "center", color: "var(--red)", fontSize: 13.5, margin: "20px 0" }}>
              Link non valido. Richiedine uno nuovo dalla pagina "Password dimenticata".
            </p>
          ) : done ? (
            <p style={{ textAlign: "center", color: "var(--green)", fontSize: 13.5, margin: "20px 0" }}>
              Password aggiornata! Ti riportiamo al login...
            </p>
          ) : (
            <>
              <p style={{ textAlign: "center", color: "var(--text-faint)", fontSize: 13, marginBottom: 24 }}>
                Scegli la tua nuova password (almeno 8 caratteri).
              </p>
              <form onSubmit={handleSubmit}>
                <div className="section-label" style={{ marginBottom: 6 }}>Nuova password</div>
                <div style={{ display: "flex", alignItems: "stretch", marginBottom: 8, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  <span style={{ display: "flex", alignItems: "center", padding: "0 11px", background: "var(--bg-soft)", borderRight: "1px solid var(--border)", color: "var(--gold)", fontSize: 14 }}>🔒</span>
                  <input
                    type={showPassword ? "text" : "password"}
                    minLength={8}
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

                {error && <p style={{ color: "var(--red)", fontSize: 13, margin: "6px 0 14px" }}>{error}</p>}

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
                  {loading ? "Salvataggio..." : "✦ Salva password ✦"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
