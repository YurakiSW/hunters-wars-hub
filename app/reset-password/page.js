"use client";
import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AuthCard, { AuthField, AuthSubmitButton } from "../../components/AuthCard";

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
    <AuthCard title="Nuova password">
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ border: "none", borderRadius: 0, flex: 1 }}
                />
              </AuthField>
            </div>

            {error && <p style={{ color: "var(--red)", fontSize: 13, margin: "6px 0 14px" }}>{error}</p>}

            <AuthSubmitButton type="submit" disabled={loading}>
              {loading ? "Salvataggio..." : "✦ Salva password ✦"}
            </AuthSubmitButton>
          </form>
        </>
      )}
    </AuthCard>
  );
}
