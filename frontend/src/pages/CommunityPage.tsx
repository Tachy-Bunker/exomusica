import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useDocumentTitle } from "../lib/useDocumentTitle";

interface PlaylistSummary {
  slug: string;
  title: string;
  description: string | null;
  owner: string;
  trackCount: number;
  albumCount: number;
}

interface SpotlightTrack {
  id: number;
  title: string;
  albumTitle: string;
  albumSlug: string;
  coverArtUrl: string | null;
  owner: string;
}

export function CommunityPage() {
  useDocumentTitle("Cult Activities");
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [spotlight, setSpotlight] = useState<SpotlightTrack | null>(null);

  useEffect(() => {
    api<PlaylistSummary[]>("/api/playlists").then(setPlaylists);
    api<SpotlightTrack | null>("/api/community/spotlight").then(setSpotlight);
  }, []);

  const byOwner = new Map<string, PlaylistSummary[]>();
  for (const p of playlists) {
    if (!byOwner.has(p.owner)) byOwner.set(p.owner, []);
    byOwner.get(p.owner)!.push(p);
  }

  return (
    <div>
      <h1>Cult Activities</h1>
      <p style={{ color: "var(--text-dim)", maxWidth: 640 }}>
        Playlists made by the community — mixing their own uploaded tracks with anything from Exomusica's own albums.
      </p>
      <p style={{ display: "flex", gap: "0.5rem" }}>
        <Link to="/my-music" className="btn">
          Manage my music
        </Link>
        <Link to="/sample-bank" className="btn">
          Sample Bank
        </Link>
        <Link to="/challenges" className="btn">
          Challenges
        </Link>
      </p>

      {spotlight && (
        <Link
          to={`/community-album/${spotlight.albumSlug}`}
          style={{
            display: "flex",
            gap: "0.8rem",
            alignItems: "center",
            padding: "0.7rem",
            border: "1px solid var(--accent-forum)",
            borderRadius: "var(--radius)",
            marginBottom: "1.5rem",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              flexShrink: 0,
              borderRadius: "var(--radius)",
              background: spotlight.coverArtUrl ? `url(${spotlight.coverArtUrl}) center/cover` : "var(--bg-elevated)",
            }}
          />
          <div>
            <div style={{ fontSize: "0.7rem", color: "var(--accent-forum)", textTransform: "uppercase" }}>Spotlight</div>
            <div style={{ fontFamily: "var(--font-display)" }}>{spotlight.title}</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
              {spotlight.albumTitle} — {spotlight.owner}
            </div>
          </div>
        </Link>
      )}

      {playlists.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>No community playlists yet.</p>
      ) : (
        [...byOwner.entries()].map(([owner, list]) => (
          <div key={owner} style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1rem", color: "var(--accent-forum)" }}>{owner}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {list.map((p) => (
                <Link
                  key={p.slug}
                  to={`/playlist/${p.slug}`}
                  style={{
                    display: "block",
                    padding: "0.5rem 0.7rem",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ fontFamily: "var(--font-display)" }}>{p.title}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
                    {p.albumCount} album{p.albumCount !== 1 ? "s" : ""} · {p.trackCount} track{p.trackCount !== 1 ? "s" : ""}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
