import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";

interface PlaylistSummary {
  slug: string;
  title: string;
  description: string | null;
  owner: string;
  createdAt: string;
  previewImageUrl?: string | null;
}

export function ListenPage() {
  useDocumentTitle("Listen");
  const navigate = useNavigate();
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);

  useEffect(() => {
    api<PlaylistSummary[]>("/api/playlists").then(setPlaylists);
  }, []);

  const featured = playlists[0] ?? null;
  const others = playlists.slice(1, 4);

  function feelingLucky() {
    if (playlists.length === 0) return;
    const pick = playlists[Math.floor(Math.random() * playlists.length)];
    navigate(`/playlist/${pick.slug}#venn`);
  }

  return (
    <div>
      <div style={{ position: "relative", borderRadius: "var(--radius)", overflow: "hidden", border: "1px solid var(--border)", height: "min(70vh, 560px)" }}>
        {featured?.previewImageUrl ? (
          <img src={featured.previewImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
          <h1 style={{ margin: 0, textAlign: "center", textShadow: "0 0 12px rgba(0,0,0,0.9)" }}>Exo-Music Player</h1>
          <p style={{ margin: "0.3rem 0 1rem", color: "#eee", textShadow: "0 0 8px rgba(0,0,0,0.9)" }}>Explore constellations of music, curated by us and other users.</p>
          <button className="btn btn-primary" style={{ pointerEvents: "auto", fontSize: "1rem" }} onClick={feelingLucky}>
            🍀 I'm feeling lucky
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem", marginTop: "1.2rem" }}>
        {featured && <PreviewCard playlist={featured} onClick={() => navigate(`/playlist/${featured.slug}#venn`)} />}
        {others.map((p) => (
          <PreviewCard key={p.slug} playlist={p} onClick={() => navigate(`/playlist/${p.slug}#venn`)} />
        ))}
        <PreviewCard
          playlist={{ slug: "__main__", title: "The main spacemap", description: null, owner: "Exomusica", createdAt: "", previewImageUrl: "/api/branches/preview.svg" }}
          onClick={() => navigate("/")}
        />
        <button
          onClick={() => navigate(user ? "/my-music" : "/join")}
          style={{
            border: "1px dashed var(--border)",
            borderRadius: "var(--radius)",
            background: "transparent",
            color: "var(--text)",
            font: "inherit",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 140,
            fontWeight: 600,
          }}
        >
          + Create my own
        </button>
      </div>
    </div>
  );
}

function PreviewCard({ playlist, onClick }: { playlist: PlaylistSummary; onClick: () => void }) {
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
        color: "var(--text)",
        font: "inherit",
      }}
    >
      <div style={{ height: 140, position: "relative", background: "var(--bg-inset)" }}>
        {playlist.previewImageUrl && <img src={playlist.previewImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      </div>
      <div style={{ padding: "0.6rem" }}>
        <p style={{ margin: 0, fontWeight: 600, color: "var(--accent-forum)" }}>{playlist.title}</p>
        <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-dim)" }}>by {playlist.owner}</p>
      </div>
    </button>
  );
}
