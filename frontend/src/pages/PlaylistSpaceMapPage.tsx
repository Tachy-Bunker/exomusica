import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAudioStore } from "../lib/audioStore";
import { useIsDesktop } from "../lib/useIsDesktop";
import { isTypingTarget } from "../lib/isTypingTarget";
import { useSpacemapField, FX_DEFAULTS, type FxSettings } from "../lib/entoptic/useSpacemapField";
import { Joystick } from "../components/Joystick";

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
  fxSettings: (Partial<FxSettings> & { coverSize?: number }) | null;
  albums: PlaylistAlbum[];
}

interface AlbumNode extends PlaylistAlbum {
  id: number;
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  wanderSeed: number;
}

function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const DEFAULT_COVER_SIZE = 56;
const REPEL_RADIUS = 90;
const REPEL_STRENGTH = 2400;
const SPRING = 3.5;
const DAMPING = 4.5;
const CAMERA_ACCEL = 1800;
const CAMERA_FRICTION = 5;
const CAMERA_MAX_SPEED = 900;
const CROSSHAIR_LOOKAHEAD = 0.16;
const CROSSHAIR_MAX_OFFSET = 65;
const CROSSHAIR_CATCHUP_RATE = 2.2;

export function PlaylistSpaceMapPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isDesktop = useIsDesktop();
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null);
  const [coverSize, setCoverSize] = useState(DEFAULT_COVER_SIZE);
  const [, forceRender] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const keysRef = useRef<Set<string>>(new Set());
  const joystickVectorRef = useRef({ x: 0, y: 0 });
  const crosshairOffsetRef = useRef({ x: 0, y: 0 });
  const reticleRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<AlbumNode[]>([]);

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

  const fxSettings: FxSettings = useMemo(() => ({ ...FX_DEFAULTS, ...(playlist?.fxSettings ?? {}) }), [playlist]);
  const { containerRef: fieldContainerRef, fieldCanvasRef, wardenCanvasRef } = useSpacemapField(fxSettings);

  // Scattered home positions, deterministic per album so revisits land the
  // same place — actual x/y then wander around that point each frame.
  useEffect(() => {
    if (!playlist) return;
    nodesRef.current = playlist.albums.map((a) => {
      const seed = hashOf(`${a.source}:${a.slug}`);
      const rand = seededRand(seed);
      const angle = rand() * Math.PI * 2;
      const radius = 120 + rand() * 260;
      const homeX = Math.cos(angle) * radius;
      const homeY = Math.sin(angle) * radius;
      return { ...a, id: seed % 1000000, homeX, homeY, x: homeX, y: homeY, wanderSeed: rand() * 1000 };
    });
  }, [playlist]);

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

  function handleJoystickMove(x: number, y: number) {
    joystickVectorRef.current = { x, y };
  }
  function handleJoystickRelease() {
    joystickVectorRef.current = { x: 0, y: 0 };
  }

  useEffect(() => {
    let lastTime = performance.now();
    let frameId: number;
    function frame(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // --- camera: WASD/joystick acceleration + friction (inertia) ---
      const cam = cameraRef.current;
      const keys = keysRef.current;
      let ax = 0;
      let ay = 0;
      if (keys.has("KeyA")) ax += CAMERA_ACCEL;
      if (keys.has("KeyD")) ax -= CAMERA_ACCEL;
      if (keys.has("KeyW")) ay += CAMERA_ACCEL;
      if (keys.has("KeyS")) ay -= CAMERA_ACCEL;
      ax -= joystickVectorRef.current.x * CAMERA_ACCEL;
      ay -= joystickVectorRef.current.y * CAMERA_ACCEL;
      cam.vx += ax * dt;
      cam.vy += ay * dt;
      cam.vx *= 1 - Math.min(CAMERA_FRICTION * dt, 1);
      cam.vy *= 1 - Math.min(CAMERA_FRICTION * dt, 1);
      const speed = Math.hypot(cam.vx, cam.vy);
      if (speed > CAMERA_MAX_SPEED) {
        cam.vx = (cam.vx / speed) * CAMERA_MAX_SPEED;
        cam.vy = (cam.vy / speed) * CAMERA_MAX_SPEED;
      }
      cam.x += cam.vx * dt;
      cam.y += cam.vy * dt;

      // --- crosshair inertia ---
      {
        const targetX = Math.max(-CROSSHAIR_MAX_OFFSET, Math.min(CROSSHAIR_MAX_OFFSET, -cam.vx * CROSSHAIR_LOOKAHEAD));
        const targetY = Math.max(-CROSSHAIR_MAX_OFFSET, Math.min(CROSSHAIR_MAX_OFFSET, -cam.vy * CROSSHAIR_LOOKAHEAD));
        const co = crosshairOffsetRef.current;
        co.x += (targetX - co.x) * Math.min(CROSSHAIR_CATCHUP_RATE * dt, 1);
        co.y += (targetY - co.y) * Math.min(CROSSHAIR_CATCHUP_RATE * dt, 1);
        if (reticleRef.current) reticleRef.current.style.transform = `translate(-50%, -50%) translate(${co.x}px, ${co.y}px)`;
      }

      // --- album covers: wander around home + repel each other ---
      const t = now / 1000;
      const nodes = nodesRef.current;
      for (const n of nodes) {
        const wanderX = Math.sin(t * 0.3 + n.wanderSeed) * 18;
        const wanderY = Math.cos(t * 0.25 + n.wanderSeed) * 18;
        const targetX = n.homeX + wanderX;
        const targetY = n.homeY + wanderY;
        let fx = (targetX - n.x) * SPRING;
        let fy = (targetY - n.y) * SPRING;
        for (const other of nodes) {
          if (other === n) continue;
          const dx = n.x - other.x;
          const dy = n.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
          if (dist < REPEL_RADIUS) {
            const push = ((REPEL_RADIUS - dist) / REPEL_RADIUS) * REPEL_STRENGTH;
            fx += (dx / dist) * push;
            fy += (dy / dist) * push;
          }
        }
        n.x += (fx / DAMPING) * dt;
        n.y += (fy / DAMPING) * dt;
      }

      forceRender((v) => (v + 1) % 1000000);
      frameId = requestAnimationFrame(frame);
    }
    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, []);

  // Off-screen compass arrows — same pattern as the main spacemap.
  const container = containerRef.current;
  const compassPoints: { angle: number; label: string; playing: boolean }[] = [];
  if (container) {
    const w = container.clientWidth;
    const h = container.clientHeight;
    for (const n of nodesRef.current) {
      const screenX = w / 2 + cameraRef.current.x + n.x;
      const screenY = h / 2 + cameraRef.current.y + n.y;
      if (screenX < 0 || screenX > w || screenY < 0 || screenY > h) {
        const playing = currentTrack?.albumSlug === n.slug;
        compassPoints.push({ angle: Math.atan2(screenY - h / 2, screenX - w / 2), label: n.title, playing });
      }
    }
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      style={{
        position: "relative",
        height: "calc(100dvh - var(--nav-height, 3.6rem) - 3rem - var(--player-height, 0px))",
        overflow: "hidden",
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        background: "var(--bg-inset)",
      }}
    >
      <div ref={fieldContainerRef} className="space-map-entoptic-field">
        <canvas ref={fieldCanvasRef} />
        <canvas ref={wardenCanvasRef} />
      </div>

      {!playlist ? (
        <p style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 5 }}>Loading…</p>
      ) : (
        <>
          <button className="btn" style={{ position: "absolute", top: 12, left: 12, zIndex: 5 }} onClick={() => navigate(`/playlist/${playlist.slug}`)}>
            View as list
          </button>
          {isDesktop && (
            <p style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", zIndex: 5, fontSize: "0.75rem", color: "var(--text-dim)" }}>
              WASD to navigate
            </p>
          )}
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

          {nodesRef.current.map((a) => (
            <Link
              key={a.id}
              to={a.source === "official" ? `/album/${a.slug}` : `/community-album/${a.slug}`}
              style={{
                position: "absolute",
                left: `calc(50% + ${cameraRef.current.x + a.x}px)`,
                top: `calc(50% + ${cameraRef.current.y + a.y}px)`,
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

          {compassPoints.map((c, i) => (
            <div
              key={i}
              title={c.label}
              style={{
                position: "absolute",
                left: `${50 + Math.cos(c.angle) * 46}%`,
                top: `${50 + Math.sin(c.angle) * 46}%`,
                transform: `translate(-50%, -50%) rotate(${c.angle}rad)`,
                fontSize: "1.1rem",
                pointerEvents: "none",
                zIndex: 4,
                color: c.playing ? "#fff" : "var(--accent-forum)",
                textShadow: c.playing ? "0 0 6px #fff" : "0 0 6px var(--accent-forum)",
              }}
            >
              ➤
            </div>
          ))}

          <div className="space-reticle" ref={reticleRef}>
            <div className="space-reticle-ring" />
            <div className="space-reticle-cross" />
          </div>

          {!isDesktop && (
            <div className="space-joystick-backdrop">
              <Joystick onMove={handleJoystickMove} onRelease={handleJoystickRelease} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
