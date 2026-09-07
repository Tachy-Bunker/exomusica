import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";

interface MyPlaylistOption {
  id: number;
  title: string;
}

export function AddToPlaylistControl({ trackId, communityTrackId }: { trackId?: number; communityTrackId?: number }) {
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState<MyPlaylistOption[]>([]);
  const [chosen, setChosen] = useState<number | "">("");
  const [status, setStatus] = useState<"idle" | "added" | "error">("idle");

  useEffect(() => {
    if (!user) return;
    api<MyPlaylistOption[]>("/api/playlists?mine=true").then(setPlaylists);
  }, [user]);

  if (!user) return null;

  async function add() {
    if (!chosen) return;
    try {
      await api(`/api/playlists/${chosen}/items`, { method: "POST", body: JSON.stringify({ trackId, communityTrackId }) });
      setStatus("added");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  if (playlists.length === 0) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
      <select value={chosen} onChange={(e) => setChosen(e.target.value ? Number(e.target.value) : "")} style={{ fontSize: "0.75rem", padding: "0.1rem" }}>
        <option value="">+ playlist…</option>
        {playlists.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
      <button className="btn" style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }} onClick={add} disabled={!chosen}>
        Add
      </button>
      {status === "added" && <span style={{ fontSize: "0.7rem", color: "var(--accent-audio)" }}>✓</span>}
      {status === "error" && <span style={{ fontSize: "0.7rem", color: "var(--accent-forum)" }}>failed</span>}
    </div>
  );
}
