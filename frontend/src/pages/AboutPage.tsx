import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useDocumentTitle } from "../lib/useDocumentTitle";

interface Feature {
  id: number;
  kind: "COLLABORATOR" | "AWARD" | "CUSTOM";
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  collaborator: { name: string; role: string; bio: string | null; pictureUrl: string | null } | null;
}

export function AboutPage() {
  useDocumentTitle("About");
  const [features, setFeatures] = useState<Feature[]>([]);

  useEffect(() => {
    api<Feature[]>("/api/about-features").then(setFeatures);
  }, []);

  return (
    <div>
      <h1>About Exomusica</h1>
      <p style={{ maxWidth: 640, color: "var(--text-dim)" }}>
        Exomusica is a platform for accessible experimental music — a laboratory where branches of sound each get
        their own space to talk and to release work.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
        {features.map((f) => {
          const name = f.kind === "COLLABORATOR" ? f.title ?? f.collaborator?.name : f.title;
          const image = f.imageUrl ?? f.collaborator?.pictureUrl;
          const description = f.description ?? f.collaborator?.bio;
          return (
            <div key={f.id} className="btn" style={{ cursor: "default", textAlign: "left" }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: f.kind === "COLLABORATOR" ? "50%" : "var(--radius)",
                  background: image ? `url(${image}) center/cover` : "var(--bg-inset)",
                  marginBottom: "0.5rem",
                }}
              />
              <div style={{ fontFamily: "var(--font-display)" }}>{name}</div>
              {f.kind === "COLLABORATOR" && f.collaborator && (
                <div style={{ fontSize: "0.8rem", color: "var(--accent-forum)" }}>{f.collaborator.role}</div>
              )}
              {description && <p style={{ fontSize: "0.85rem", marginTop: "0.4rem" }}>{description}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
