export default function PendingPage() {
  return (
    <div style={{ maxWidth: 480, margin: "15vh auto", padding: "0 20px", textAlign: "center" }}>
      <h1 className="f-hero" style={{ fontSize: 24, marginBottom: 12 }}>Richiesta in revisione</h1>
      <p style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>
        Il tuo nickname non è stato trovato automaticamente nel roster della gilda. Un Admin controllerà la tua
        richiesta a mano — nel frattempo non hai ancora accesso ai contenuti del sito.
      </p>
    </div>
  );
}
