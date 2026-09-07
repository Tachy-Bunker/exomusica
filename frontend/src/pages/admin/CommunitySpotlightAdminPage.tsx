import { useEffect, useState } from "react";
import { api } from "../../lib/api";

interface SpotlightTrack {
  id: number;
  title: string;
  albumTitle: string;
}

export function CommunitySpotlightAdminPage() {
  const [current, setCurrent] = useState<SpotlightTrack | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: number; title: string; albumTitle: string }[]>([]);

  useEffect(() => {
    api<SpotlightTrack | null>("/api/community/spotlight").then(setCurrent);
  }, []);

  async function search() {
    if (!query.trim()) return;
    const tracks = await api<{ id: number; title: string; albumTitle: string }[]>(`/api/community-tracks/search?q=${encodeURIComponent(query.trim())}`);
    setResults(tracks);
  }

  async function setSpotlight(trackId: number | null) {
    await api("/api/admin/community/spotlight", { method: "PUT", body: JSON.stringify({ trackId }) });
    setCurrent(trackId ? await api<SpotlightTrack | null>("/api/community/spotlight") : null);
  }

  return (
    <div style={{ maxWidth: 500 }}>
      <h1>Community Spotlight</h1>
      <p style={{ color: "var(--text-dim)" }}>Pick one community track to feature at the top of the Community page.</p>

      {current ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <span>
            Currently: <strong>{current.title}</strong> — {current.albumTitle}
          </span>
          <button className="btn btn-danger" onClick={() => setSpotlight(null)}>
            Clear
          </button>
        </div>
      ) : (
        <p style={{ color: "var(--text-dim)" }}>Nothing spotlighted right now.</p>
      )}

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input placeholder="Search community tracks…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1 }} />
        <button className="btn" onClick={search}>
          Search
        </button>
      </div>
      {results.map((t) => (
        <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.4rem" }}>
          <span>
            {t.title} — {t.albumTitle}
          </span>
          <button className="btn btn-primary" onClick={() => setSpotlight(t.id)}>
            Set as spotlight
          </button>
        </div>
      ))}
    </div>
  );
}
