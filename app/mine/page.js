"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../../components/Header";

export default function MinePage() {
  const [user, setUser] = useState(null);
  const [defs, setDefs] = useState([]);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (!d.user) return router.push("/login");
      setUser(d.user);
      fetch("/api/defs").then((r) => r.json()).then((dd) => setDefs(dd.defs || []));
    });
  }, []);

  if (!user) return null;

  const myDefs = defs.filter((d) => d.authorId === user.id);
  const myCounters = defs.flatMap((d) => d.counters.filter((c) => c.authorId === user.id).map((c) => ({ ...c, defName: d.monsters.join(" / "), defId: d.id })));

  return (
    <div>
      <Header user={user} />
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 20px 60px" }}>
        <h1 className="f-display" style={{ fontSize: 24 }}>Le mie proposte</h1>

        {myDefs.length > 0 && (
          <>
            <div className="section-label" style={{ marginTop: 20 }}>Difese proposte ({myDefs.length})</div>
            {myDefs.map((d) => (
              <a key={d.id} href={`/defs/${d.id}`} className="card" style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, textDecoration: "none" }}>
                <span>{d.monsters.join(" / ")}</span>
                <span className={`badge ${d.status === "approved" ? "badge-approved" : "badge-pending"}`}>{d.status === "approved" ? "Approvata" : "In attesa"}</span>
              </a>
            ))}
          </>
        )}

        {myCounters.length > 0 && (
          <>
            <div className="section-label" style={{ marginTop: 20 }}>Counter proposti ({myCounters.length})</div>
            {myCounters.map((c) => (
              <a key={c.id} href={`/defs/${c.defId}`} className="card" style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, textDecoration: "none" }}>
                <span>{c.offense.join(" · ")} <span className="f-mono" style={{ color: "var(--text-faint)", fontSize: 11 }}>su {c.defName}</span></span>
                <span className={`badge ${c.status === "approved" ? "badge-approved" : "badge-pending"}`}>{c.status === "approved" ? "Approvato" : "In attesa"}</span>
              </a>
            ))}
          </>
        )}

        {myDefs.length === 0 && myCounters.length === 0 && <p style={{ color: "var(--text-faint)" }}>Non hai ancora proposto nulla.</p>}
      </div>
    </div>
  );
}
