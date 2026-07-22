// Cornice condivisa per le 4 pagine di autenticazione (login, registrazione,
// password dimenticata, reimposta password) — prima era la stessa identica
// struttura copiata 4 volte, ora basta cambiarla qui.
export default function AuthCard({ title, children }) {
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
            {title}
          </h2>
          {children}
        </div>
      </div>
    </div>
  );
}

// Piccoli pezzi ripetuti anche loro nelle 4 pagine (campo con icona a
// sinistra, separatore a stella): condivisi qui per lo stesso motivo.
export function AuthField({ icon, right, children }) {
  return (
    <div style={{ display: "flex", alignItems: "stretch", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      <span style={{ display: "flex", alignItems: "center", padding: "0 11px", background: "var(--bg-soft)", borderRight: "1px solid var(--border)", color: "var(--gold)", fontSize: 14 }}>
        {icon}
      </span>
      {children}
      {right}
    </div>
  );
}

export function AuthDivider() {
  return <div style={{ textAlign: "center", color: "var(--border)", fontSize: 11, margin: "22px 0 14px" }}>✦</div>;
}

export function AuthSubmitButton({ children, ...props }) {
  return (
    <button
      {...props}
      className="f-display"
      style={{
        width: "100%", padding: "13px 0", borderRadius: 10, border: "1px solid var(--gold)",
        background: "linear-gradient(180deg, #e6c874, var(--gold))",
        color: "#1a1408", fontSize: 15, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase",
        cursor: "pointer", boxShadow: "0 4px 16px -4px rgba(211,169,79,.5)", marginTop: 14,
      }}
    >
      {children}
    </button>
  );
}
