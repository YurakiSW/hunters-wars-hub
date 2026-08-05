import Sticker from "../components/Sticker";

export default function NotFound() {
  return (
    <div style={{ minHeight: "70vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 20 }}>
      <Sticker name="confuso" size={100} style={{ marginBottom: 12 }} />
      <h1 className="f-display" style={{ fontSize: 22, margin: "0 0 6px" }}>Pagina non trovata</h1>
      <p style={{ color: "var(--text-faint)", marginBottom: 18 }}>Questa pagina non esiste, o non esiste più.</p>
      <a href="/defs" className="btn btn-primary">Torna a Counters</a>
    </div>
  );
}
