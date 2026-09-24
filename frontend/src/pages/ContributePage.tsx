import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useDocumentTitle } from "../lib/useDocumentTitle";

interface ContributeBranch {
  slug: string;
  name: string;
  description: string | null;
  coverArtUrl: string | null;
  hasBrief: boolean;
  backgroundUrl: string | null;
  backgroundOpacity: number;
  previewUrl: string | null;
  sketchCount: number;
}

export function ContributePage() {
  useDocumentTitle("Choose your next project");
  const [branches, setBranches] = useState<ContributeBranch[]>([]);

  useEffect(() => {
    api<ContributeBranch[]>("/api/contribute/branches").then(setBranches);
  }, []);

  return (
    <div style={{ maxWidth: 900 }}>
      <h1>Choose your next project</h1>
      <p style={{ color: "var(--text-dim)" }}>
        Pick a branch, grab the brief and any curated sketches, and submit your own take when it's ready.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
        {branches.map((b) => (
          <div key={b.slug} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}>
            {b.backgroundUrl && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: `url(${b.backgroundUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  opacity: b.backgroundOpacity,
                  zIndex: 0,
                }}
              />
            )}
            <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: 1 }}>
            {b.coverArtUrl && <img src={b.coverArtUrl} alt="" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover" }} />}
            <div style={{ padding: "0.7rem", display: "flex", flexDirection: "column", gap: "0.4rem", flex: 1 }}>
              <h3 style={{ margin: 0 }}>{b.name}</h3>
              {b.description && <p style={{ fontSize: "0.85rem", color: "var(--text-dim)", margin: 0 }}>{b.description}</p>}

              {b.previewUrl && (
                <audio controls src={b.previewUrl} style={{ width: "100%", height: 32 }} />
              )}

              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "auto" }}>
                {b.hasBrief && (
                  <a className="btn" href={`/api/contribute/branches/${b.slug}/brief`} style={{ fontSize: "0.78rem" }}>
                    Download brief
                  </a>
                )}
                {b.sketchCount > 0 && (
                  <a className="btn" href={`/api/contribute/branches/${b.slug}/sketches.zip`} style={{ fontSize: "0.78rem" }}>
                    Sketches ({b.sketchCount})
                  </a>
                )}
                <Link className="btn" to={`/branch/${b.slug}`} style={{ fontSize: "0.78rem" }}>
                  View branch
                </Link>
                <Link className="btn btn-primary" to={`/submit?branch=${b.slug}`} style={{ fontSize: "0.78rem" }}>
                  Submit work
                </Link>
              </div>
            </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
