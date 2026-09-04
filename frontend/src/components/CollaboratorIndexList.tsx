import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

interface CollaboratorSummary {
  id: number;
  slug: string | null;
  name: string;
  role: string;
  bio: string | null;
  pictureUrl: string | null;
}

export function CollaboratorIndexList() {
  const [collaborators, setCollaborators] = useState<CollaboratorSummary[]>([]);

  useEffect(() => {
    api<CollaboratorSummary[]>("/api/collaborators").then(setCollaborators);
  }, []);

  if (collaborators.length === 0) return <p style={{ color: "var(--text-dim)" }}>No collaborators yet.</p>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
      {collaborators.map((c) => {
        const card = (
          <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.8rem", display: "flex", gap: "0.7rem" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                flexShrink: 0,
                background: c.pictureUrl ? `url(${c.pictureUrl}) center/cover` : "var(--bg-elevated)",
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem", overflowWrap: "break-word" }}>{c.name}</div>
              <div style={{ fontSize: "0.85rem", color: "var(--accent-forum)" }}>{c.role}</div>
              {c.bio && (
                <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "0.2rem", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {c.bio}
                </p>
              )}
            </div>
          </div>
        );
        return c.slug ? (
          <Link key={c.id} to={`/collaborator/${c.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
            {card}
          </Link>
        ) : (
          <div key={c.id}>{card}</div>
        );
      })}
    </div>
  );
}
