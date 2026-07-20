"use client";

function parseVideoUrl(url) {
  if (!url) return null;
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/shorts\/)([\w-]{11})/);
  if (yt) return { type: "youtube", id: yt[1] };
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return { type: "file" };
  return { type: "link" };
}

export default function VideoPreview({ url }) {
  const parsed = parseVideoUrl(url);
  if (!parsed) return null;

  if (parsed.type === "youtube") {
    return (
      <div style={{ marginTop: 8, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-soft)", position: "relative", width: "100%", maxWidth: 360, paddingBottom: "56.25%", height: 0 }}>
        <iframe
          src={`https://www.youtube.com/embed/${parsed.id}`}
          title="Anteprima video"
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  if (parsed.type === "file") {
    return (
      <video controls style={{ marginTop: 8, maxWidth: 360, width: "100%", borderRadius: 8, border: "1px solid var(--border-soft)" }}>
        <source src={url} />
      </video>
    );
  }
  return (
    <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 6 }}>
      Link non riconosciuto come YouTube o file video diretto: verrà mostrato come semplice link, senza anteprima.
    </p>
  );
}
