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
          <h2 className="f-display" style={{ fontSize: 22, textAlign: "center", color: "var(--text)", margin: "0 0 4px" }}>
            🔑 Nuova password
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
                <div style={{ position: "relative", marginBottom: 22 }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--gold)", fontSize: 14 }}>🔒</span>
                  <input
                    type={showPassword ? "text" : "password"}
                    minLength={8}
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
