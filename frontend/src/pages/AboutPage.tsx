import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Collaborator {
  id: number;
  name: string;
  role: string;
  bio: string | null;
  pictureUrl: string | null;
}

export function AboutPage() {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);

  useEffect(() => {
    api<Collaborator[]>("/api/collaborators").then(setCollaborators);
  }, []);

  return (
    <div>
      <h1>About Exomusica</h1>
      <p style={{ maxWidth: 640, color: "var(--text-dim)" }}>
        Exomusica is a platform for accessible experimental music — a laboratory where branches of sound each get
        their own space to talk and to release work.
      </p>

      <h2 style={{ fontSize: "1.1rem" }}>Collaborators</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
        {collaborators.map((c) => (
          <div key={c.id} className="btn" style={{ cursor: "default", textAlign: "left" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: c.pictureUrl ? `url(${c.pictureUrl}) center/cover` : "var(--bg-inset)",
                marginBottom: "0.5rem",
              }}
            />
            <div style={{ fontFamily: "var(--font-display)" }}>{c.name}</div>
            <div style={{ fontSize: "0.8rem", color: "var(--accent-forum)" }}>{c.role}</div>
            {c.bio && <p style={{ fontSize: "0.85rem", marginTop: "0.4rem" }}>{c.bio}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
