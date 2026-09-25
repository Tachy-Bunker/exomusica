import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useDocumentTitle } from "../lib/useDocumentTitle";

interface PlaylistSummary {
  slug: string;
  title: string;
  description: string | null;
  owner: string;
  createdAt: string;
}

export function ListenPage() {
  useDocumentTitle("Listen");
  const navigate = useNavigate();
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);

  useEffect(() => {
    api<PlaylistSummary[]>("/api/playlists").then(setPlaylists);
  }, []);

  const featured = playlists[0] ?? null;
  const others = playlists.slice(1, 3);

  function surpriseMe() {
    if (playlists.length === 0) return;
    const pick = playlists[Math.floor(Math.random() * playlists.length)];
    navigate(`/playlist/${pick.slug}#venn`);
  }

  return (
    <div>
      <div style={{ position: "relative", borderRadius: "var(--radius)", overflow: "hidden", border: "1px solid var(--border)", height: "min(70vh, 560px)" }}>
        {featured ? (
          <iframe
            key={featured.slug}
            src={`/embed/playlist/${featured.slug}?hideControls=1#venn`}
            title="Live preview"
            style={{ width: "100%", height: "100%", border: 0, pointerEvents: "none" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "var(--bg-inset)" }} />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "1.5rem",
            background: "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.75) 100%)",
            pointerEvents: "none",
          }}
        >
          <h1 style={{ margin: 0, textAlign: "center", textShadow: "0 0 12px rgba(0,0,0,0.9)" }}>Wander the sound.</h1>
          <p style={{ margin: "0.3rem 0 1rem", color: "#eee", textShadow: "0 0 8px rgba(0,0,0,0.9)" }}>Discover music by how it connects, not by search.</p>
          <button className="btn btn-primary" style={{ pointerEvents: "auto", fontSize: "1rem" }} onClick={surpriseMe}>
            🎲 Surprise me
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem", marginTop: "1.2rem" }}>
        {featured && (
          <PreviewCard
            title="Start here"
            playlist={featured}
            onClick={() => navigate(`/playlist/${featured.slug}#venn`)}
          />
        )}
        {others.map((p) => (
          <PreviewCard key={p.slug} title="Explore" playlist={p} onClick={() => navigate(`/playlist/${p.slug}#venn`)} />
        ))}
      </div>
    </div>
  );
}

function PreviewCard({ title, playlist, onClick }: { title: string; playlist: PlaylistSummary; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
        background: "var(--bg-elevated)",
        cursor: "pointer",
        textAlign: "left",
        padding: 0,
      }}
    >
      <div style={{ height: 140, position: "relative" }}>
        <iframe
          src={`/embed/playlist/${playlist.slug}?hideControls=1`}
          title={playlist.title}
          style={{ width: "100%", height: "100%", border: 0, pointerEvents: "none" }}
        />
      </div>
      <div style={{ padding: "0.6rem" }}>
        <p style={{ margin: 0, fontSize: "0.7rem", color: "var(--accent-forum)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{title}</p>
        <p style={{ margin: "0.1rem 0 0", fontWeight: 600 }}>{playlist.title}</p>
        <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-dim)" }}>by {playlist.owner}</p>
      </div>
    </button>
  );
}
