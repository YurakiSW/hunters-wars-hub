"use client";
import { useState } from "react";

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
            Password dimenticata
          </h2>

          {sent ? (
            <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13.5, margin: "20px 0" }}>
              Se quell'email è registrata, ti abbiamo appena mandato un link per reimpostare la password — controlla
              la posta (anche lo spam).
            </p>
          ) : (
            <>
              <p style={{ textAlign: "center", color: "var(--text-faint)", fontSize: 13, marginBottom: 24 }}>
                Scrivi la tua email, ti mandiamo un link per sceglierne una nuova.
              </p>
              <form onSubmit={handleSubmit}>
                <div className="section-label" style={{ marginBottom: 6 }}>Email</div>
                <div style={{ display: "flex", alignItems: "stretch", marginBottom: 22, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  <span style={{ display: "flex", alignItems: "center", padding: "0 11px", background: "var(--bg-soft)", borderRight: "1px solid var(--border)", color: "var(--gold)", fontSize: 14 }}>✉</span>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ border: "none", borderRadius: 0, flex: 1 }} />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="f-display"
                  style={{
                    width: "100%", padding: "13px 0", borderRadius: 10, border: "1px solid var(--gold)",
                    background: "linear-gradient(180deg, #e6c874, var(--gold))",
                    color: "#1a1408", fontSize: 15, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase",
                    cursor: "pointer", boxShadow: "0 4px 16px -4px rgba(211,169,79,.5)",
                  }}
                >
                  {loading ? "Invio..." : "✦ Invia link ✦"}
                </button>
              </form>
            </>
          )}

          <div style={{ textAlign: "center", color: "var(--border)", fontSize: 11, margin: "22px 0 14px" }}>✦</div>
          <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
            <a href="/login" style={{ color: "var(--violet)" }}>← Torna al login</a>
          </p>
        </div>
      </div>
    </div>
  );
}
