"use client";

// Solo mostri VERIFICATI uno per uno su swarfarm.com hanno un'icona vera.
// Tutti gli altri restano con un cerchio colorato + iniziali, finché non
// vengono aggiunti qui (a mano dal pannello "Mostri") o dalla sync automatica.
const ICON_MAP = {
  teshar: "https://swarfarm.com/static/herders/images/monsters/unit_icon_0017_2_3.png",
  jaara: "https://swarfarm.com/static/herders/images/monsters/unit_icon_0017_4_3.png",
  narsha: "https://swarfarm.com/static/herders/images/monsters/unit_icon_0054_3_1.png",
  veromos: "https://swarfarm.com/static/herders/images/monsters/unit_icon_0032_4_2.png",
  geldnir: "https://swarfarm.com/static/herders/images/monsters/unit_icon_0047_3_2.png",
  chandra: "https://swarfarm.com/static/herders/images/monsters/unit_icon_0027_0_1.png",
  taranys: "https://swarfarm.com/static/herders/images/monsters/unit_icon_0046_2_2.png",
  "water nobara": "https://swarfarm.com/static/herders/images/monsters/unit_icon_0156_1_1.png",
  "fire nobara": "https://swarfarm.com/static/herders/images/monsters/unit_icon_0156_1_2.png",
  "wind nobara": "https://swarfarm.com/static/herders/images/monsters/unit_icon_0156_1_3.png",
  "light nobara": "https://swarfarm.com/static/herders/images/monsters/unit_icon_0156_1_4.png",
  "dark nobara": "https://swarfarm.com/static/herders/images/monsters/unit_icon_0156_1_5.png",
  "water aragorn": "https://swarfarm.com/static/herders/images/monsters/unit_icon_0206_1_1.png",
  "fire aragorn": "https://swarfarm.com/static/herders/images/monsters/unit_icon_0206_1_2.png",
  "wind aragorn": "https://swarfarm.com/static/herders/images/monsters/unit_icon_0206_1_3.png",
  "light aragorn": "https://swarfarm.com/static/herders/images/monsters/unit_icon_0206_1_4.png",
  "dark aragorn": "https://swarfarm.com/static/herders/images/monsters/unit_icon_0206_1_5.png",
  "water tanjiro": "https://swarfarm.com/static/herders/images/monsters/unit_icon_0167_1_1.png",
  "fire tanjiro": "https://swarfarm.com/static/herders/images/monsters/unit_icon_0167_1_2.png",
  "wind tanjiro": "https://swarfarm.com/static/herders/images/monsters/unit_icon_0167_1_3.png",
  "light tanjiro": "https://swarfarm.com/static/herders/images/monsters/unit_icon_0167_1_4.png",
  "dark tanjiro": "https://swarfarm.com/static/herders/images/monsters/unit_icon_0167_1_5.png",
};

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

export default function MonsterCrest({ name, size = 40, lead = false }) {
  const key = (name || "").toLowerCase().trim();
  const icon = ICON_MAP[key];
  const hue = hashHue(key || "x");
  return (
    <div
      title={name}
      style={{
        width: size,
        height: size,
        borderRadius: "9999px",
        border: `2px solid ${lead ? "var(--gold)" : "var(--border)"}`,
        background: icon ? "var(--bg-soft)" : `hsl(${hue} 45% 22%)`,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        position: "relative",
      }}
    >
      {icon ? (
        <img src={icon} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span className="f-display" style={{ color: `hsl(${hue} 70% 82%)`, fontSize: size * 0.34, fontWeight: 700 }}>
          {(name || "?").slice(0, 2).toUpperCase()}
        </span>
      )}
      {lead && (
        <span
          className="f-mono"
          style={{ position: "absolute", bottom: -2, right: -2, background: "var(--gold)", color: "#1a1408", fontSize: 8, fontWeight: 700, borderRadius: 4, padding: "0 3px" }}
        >
          L
        </span>
      )}
    </div>
  );
}
