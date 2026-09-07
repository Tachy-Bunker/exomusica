import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isTypingTarget } from "../lib/isTypingTarget";

interface PlaylistAlbum {
  slug: string;
  title: string;
  coverArtUrl: string | null;
  source: "official" | "community";
}
interface PlaylistDetail {
  id: number;
  slug: string;
  title: string;
  ownerId: number;
  fxSettings: { coverSize?: number } | null;
  albums: PlaylistAlbum[];
}

function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
// Simple hash so the same album always lands in the same spot across visits.
function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const DEFAULT_COVER_SIZE = 56;

export function PlaylistSpaceMapPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef(pan);
  panRef.current = pan;
  const keysRef = useRef<Set<string>>(new Set());
  const velRef = useRef({ vx: 0, vy: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [coverSize, setCoverSize] = useState(DEFAULT_COVER_SIZE);

  function reload() {
    if (!slug) return;
    api<PlaylistDetail>(`/api/playlists/${slug}`).then((p) => {
      setPlaylist(p);
      setCoverSize(p.fxSettings?.coverSize ?? DEFAULT_COVER_SIZE);
    });
  }
  useEffect(reload, [slug]);

  async function saveCoverSize(size: number) {
    setCoverSize(size);
    if (!playlist) return;
    await api(`/api/playlists/${playlist.id}/fx-settings`, { method: "PATCH", body: JSON.stringify({ coverSize: size }) });
  }

  // Deterministic world position + a synthetic numeric id (combining
  // source+slug, since official and community album ids can collide) for
  // each album.
  const albumNodes = useMemo(() => {
    if (!playlist) return [];
    return playlist.albums.map((a) => {
      const seed = hashOf(`${a.source}:${a.slug}`);
      const rand = seededRand(seed);
      const angle = rand() * Math.PI * 2;
      const radius = 120 + rand() * 260;
      return { ...a, id: seed % 1000000, worldX: Math.cos(angle) * radius, worldY: Math.sin(angle) * radius };
    });
  }, [playlist]);

  // WASD panning — same feel as the forum map, no crosshair lock-on here
  // given the smaller scope of this view.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) keysRef.current.add(e.code);
    }
    function onKeyUp(e: KeyboardEvent) {
      keysRef.current.delete(e.code);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    let last = performance.now();
    let frameId: number;
    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const keys = keysRef.current;
      let ax = 0;
      let ay = 0;
      if (keys.has("KeyA")) ax += 900;
      if (keys.has("KeyD")) ax -= 900;
      if (keys.has("KeyW")) ay += 900;
      if (keys.has("KeyS")) ay -= 900;
      const v = velRef.current;
      v.vx = (v.vx + ax * dt) * (1 - Math.min(5 * dt, 1));
      v.vy = (v.vy + ay * dt) * (1 - Math.min(5 * dt, 1));
      if (Math.abs(v.vx) > 0.05 || Math.abs(v.vy) > 0.05) {
        const next = { x: panRef.current.x + v.vx * dt, y: panRef.current.y + v.vy * dt };
        panRef.current = next;
        setPan(next);
      }
      frameId = requestAnimationFrame(frame);
    }
    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        height: "calc(100dvh - var(--nav-height, 3.6rem) - 3rem - var(--player-height, 0px))",
        overflow: "hidden",
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        background: "var(--bg-inset)",
      }}
    >
      {!playlist ? (
        <p style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 5 }}>Loading…</p>
      ) : (
        <>
          <button className="btn" style={{ position: "absolute", top: 12, left: 12, zIndex: 5 }} onClick={() => navigate(`/playlist/${playlist.slug}`)}>
            View as list
          </button>
          <p style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", zIndex: 5, fontSize: "0.75rem", color: "var(--text-dim)" }}>
            WASD to navigate
          </p>
          {user?.id === playlist.ownerId && (
            <div
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                zIndex: 5,
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                background: "var(--bg-elevated)",
                padding: "0.3rem 0.6rem",
                borderRadius: "var(--radius)",
              }}
            >
              <label style={{ fontSize: "0.75rem" }}>Cover size</label>
              <input type="range" min={32} max={140} value={coverSize} onChange={(e) => saveCoverSize(Number(e.target.value))} />
            </div>
          )}

          {albumNodes.map((a) => (
            <Link
              key={a.id}
              to={a.source === "official" ? `/album/${a.slug}` : `/community-album/${a.slug}`}
              style={{
                position: "absolute",
                left: `calc(50% + ${pan.x + a.worldX}px)`,
                top: `calc(50% + ${pan.y + a.worldY}px)`,
                transform: "translate(-50%, -50%)",
                zIndex: 3,
                textAlign: "center",
                textDecoration: "none",
                color: "var(--text)",
                width: coverSize * 1.4,
              }}
            >
              <div
                style={{
                  width: coverSize,
                  height: coverSize,
                  margin: "0 auto",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background: a.coverArtUrl ? `url(${a.coverArtUrl}) center/cover` : "var(--bg-elevated)",
                }}
              />
              <div style={{ fontSize: Math.max(9, coverSize * 0.125), marginTop: "0.2rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {a.title}
              </div>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
