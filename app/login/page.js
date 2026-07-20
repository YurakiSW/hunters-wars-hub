"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return setError(data.error || "Errore di accesso.");
    router.push("/defs");
    router.refresh();
  }

  return (
    <div style={{ maxWidth: 380, margin: "10vh auto", padding: "0 20px" }}>
      <h1 className="f-hero" style={{ fontSize: 26, marginBottom: 4 }}>Hunters Wars</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>Accedi al Counter Siege hub.</p>
      <form onSubmit={handleSubmit} className="card">
        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, marginBottom: 5, fontWeight: 600 }}>Email</div>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label style={{ display: "block", marginBottom: 16 }}>
          <div style={{ fontSize: 12.5, marginBottom: 5, fontWeight: 600 }}>Password</div>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Accesso..." : "Accedi"}
        </button>
      </form>
      <p style={{ marginTop: 16, fontSize: 13, color: "var(--text-muted)" }}>
        Non hai un account? <a href="/register" style={{ color: "var(--violet)" }}>Registrati</a>
      </p>
    </div>
  );
}
