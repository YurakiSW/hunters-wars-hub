import Sticker from "./Sticker";

export default function LoadingScreen() {
  return (
    <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
      <Sticker name="totem" size={170} alt="" />
      <p style={{ color: "var(--text-faint)", fontSize: 13 }}>Caricamento...</p>
    </div>
  );
}
