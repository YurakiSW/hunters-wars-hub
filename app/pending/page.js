export default function PendingPage() {
  return (
    <div style={{ maxWidth: 480, margin: "15vh auto", padding: "0 20px", textAlign: "center" }}>
      <h1 className="f-hero" style={{ fontSize: 28, marginBottom: 12 }}>MACCHITTESENCULA 🦆🤡</h1>
      <p style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>
        Il tuo nickname non è stato trovato automaticamente nel roster della gilda. Nel frattempo non hai ancora
        accesso ai contenuti del sito.
      </p>
      <p style={{ color: "var(--text-faint)", fontSize: 12.5, marginTop: 16 }}>
        Un Admin valuterà se sei il benvenuto.
      </p>
    </div>
  );
}
