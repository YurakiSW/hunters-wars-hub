"use client";
import { useState } from "react";
import AuthCard, { AuthField, AuthDivider, AuthSubmitButton } from "../../components/AuthCard";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    setSent(true); // stessa risposta sia che l'email esista o no
  }

  return (
    <AuthCard title="Password dimenticata">
      {sent ? (
        <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13.5, margin: "20px 0" }}>
          Se quell'email è registrata, ti abbiamo appena mandato un link per reimpostare la password — controlla la
          posta (anche lo spam).
        </p>
      ) : (
        <>
          <p style={{ textAlign: "center", color: "var(--text-faint)", fontSize: 13, marginBottom: 24 }}>
            Scrivi la tua email, ti mandiamo un link per sceglierne una nuova.
          </p>
          <form onSubmit={handleSubmit}>
            <div className="section-label" style={{ marginBottom: 6 }}>Email</div>
            <div style={{ marginBottom: 22 }}>
              <AuthField icon="✉">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ border: "none", borderRadius: 0, flex: 1 }} />
              </AuthField>
            </div>
            <AuthSubmitButton type="submit" disabled={loading}>
              {loading ? "Invio..." : "✦ Invia link ✦"}
            </AuthSubmitButton>
          </form>
        </>
      )}

      <AuthDivider />
      <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
        <a href="/login" style={{ color: "var(--violet)" }}>← Torna al login</a>
      </p>
    </AuthCard>
  );
}
