import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAudioStore, shuffleArray } from "../lib/audioStore";
import { useIsDesktop } from "../lib/useIsDesktop";
import { isTypingTarget } from "../lib/isTypingTarget";
import { useSpacemapField, FX_DEFAULTS, type FxSettings } from "../lib/entoptic/useSpacemapField";
import { Joystick } from "../components/Joystick";
import type { PlayableTrackDTO } from "../lib/types";

interface PlaylistAlbum {
  slug: string;
  title: string;
  coverArtUrl: string | null;
  source: "official" | "community";
}
interface PlaylistItem {
  id: number;
  source: "official" | "community";
  trackId: number;
  title: string;
  fileUrl: string;
  durationSeconds: number | null;
  albumTitle: string;
  albumSlug: string;
  coverArtUrl: string | null;
  composer: string | null;
  branchSlug: string | null;
  replayGainDb: number | null;
}
interface PlaylistDetail {
  id: number;
  slug: string;
  title: string;
  ownerId: number;
  fxSettings: (Partial<FxSettings> & { coverSize?: number; spacing?: number; roamSpeed?: number }) | null;
  albums: PlaylistAlbum[];
  items: PlaylistItem[];
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

function playlistItemToPlayable(item: PlaylistItem): PlayableTrackDTO {
  return {
    id: item.trackId,
    title: item.title,
    fileUrl: item.fileUrl,
    format: "MP3",
    durationSeconds: item.durationSeconds,
    position: 0,
    albumTitle: item.albumTitle,
    albumSlug: item.albumSlug,
    coverArtUrl: item.coverArtUrl,
    composer: item.composer ?? "",
    branchSlug: item.branchSlug,
    bookmarks: [],
    replayGainDb: item.replayGainDb,
    source: item.source,
  };
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
const LOCK_RADIUS = 58;
const LOCK_TIME = 0.9;

export function PlaylistSpaceMapPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isDesktop = useIsDesktop();
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const play = useAudioStore((s) => s.play);
  const addToQueue = useAudioStore((s) => s.addToQueue);
  const clearQueue = useAudioStore((s) => s.clearQueue);
  const setCurrentPlaylist = useAudioStore((s) => s.setCurrentPlaylist);
  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null);
  const [controls, setControls] = useState({ coverSize: DEFAULT_COVER_SIZE, bgBright: 0.5, bgSat: 0.5, bgContrast: 0.5, rmsBrightnessAmount: 0.3, spacing: 1, roamSpeed: 1 });
  const [, forceRender] = useState(0);
  const [lockedId, setLockedId] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const keysRef = useRef<Set<string>>(new Set());
  const joystickVectorRef = useRef({ x: 0, y: 0 });
  const crosshairOffsetRef = useRef({ x: 0, y: 0 });
  const reticleRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<AlbumNode[]>([]);
  const lockedIdRef = useRef<number | null>(null);
  const lockProgressRef = useRef(0);
  const playlistRef = useRef<PlaylistDetail | null>(null);
  playlistRef.current = playlist;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsRef = useRef(controls);
  controlsRef.current = controls;

  function reload() {
    if (!slug) return;
    api<PlaylistDetail>(`/api/playlists/${slug}`).then((p) => {
      setPlaylist(p);
      setControls({
        coverSize: p.fxSettings?.coverSize ?? DEFAULT_COVER_SIZE,
        bgBright: p.fxSettings?.bgBright ?? 0.5,
        bgSat: p.fxSettings?.bgSat ?? 0.5,
        bgContrast: p.fxSettings?.bgContrast ?? 0.5,
        rmsBrightnessAmount: p.fxSettings?.rmsBrightnessAmount ?? 0.3,
        spacing: p.fxSettings?.spacing ?? 1,
        roamSpeed: p.fxSettings?.roamSpeed ?? 1,
      });
    });
  }
  useEffect(reload, [slug]);

  // Updates the visible slider immediately, but debounces the actual save
  // — five sliders each firing a request per drag tick would otherwise
  // spam the API, unlike the single cover-size slider this replaced.
  function updateControl(patch: Partial<typeof controls>) {
    setControls((c) => ({ ...c, ...patch }));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const p = playlistRef.current;
      if (!p) return;
      api(`/api/playlists/${p.id}/fx-settings`, { method: "PATCH", body: JSON.stringify({ ...controls, ...patch }) }).catch(() => {});
    }, 400);
  }

  const fxSettings: FxSettings = useMemo(
    () => ({ ...FX_DEFAULTS, bgBright: controls.bgBright, bgSat: controls.bgSat, bgContrast: controls.bgContrast, rmsBrightnessAmount: controls.rmsBrightnessAmount }),
    [controls],
  );
  const { containerRef: fieldContainerRef, fieldCanvasRef, wardenCanvasRef } = useSpacemapField(fxSettings);

  // Scattered home positions, deterministic per album so revisits land the
  // same place — actual x/y then wander around that point each frame.
  // Cartesian random points (rather than polar angle+radius, which tends
  // to look like uniform rings) pushed out to a guaranteed minimum
  // distance from the center Play-all button, both scaled by the
  // spacing control.
  useEffect(() => {
    if (!playlist) return;
    const minDist = 170 * controls.spacing;
    const spread = 420 * controls.spacing;
    nodesRef.current = playlist.albums.map((a) => {
      const seed = hashOf(`${a.source}:${a.slug}`);
      const rand = seededRand(seed);
      let homeX = (rand() - 0.5) * 2 * spread;
      let homeY = (rand() - 0.5) * 2 * spread;
      const dist = Math.hypot(homeX, homeY) || 0.001;
      if (dist < minDist) {
        homeX = (homeX / dist) * minDist;
        homeY = (homeY / dist) * minDist;
      }
      return { ...a, id: seed % 1000000, homeX, homeY, x: homeX, y: homeY, wanderSeed: rand() * 1000 };
    });
  }, [playlist, controls.spacing]);

  async function playAlbum(node: AlbumNode) {
    const tracks =
      node.source === "official"
        ? (await api<{ tracks: PlayableTrackDTO[] }>(`/api/albums/${node.slug}`)).tracks
        : (await api<{ tracks: PlayableTrackDTO[] }>(`/api/community-albums/${node.slug}`)).tracks;
    if (tracks.length === 0) return;
    const [first, ...restOfAlbum] = tracks;
    play(first);
    clearQueue();
    addToQueue(restOfAlbum);

    const p = playlistRef.current;
    if (p) {
      setCurrentPlaylist({ slug: p.slug, title: p.title });
      // Smart contextualization: once this album finishes, keep playing
      // through the rest of the playlist rather than just stopping —
      // shuffled, and with this album's own tracks excluded so nothing
      // repeats right after it just played.
      const restOfPlaylist = p.items.filter((item) => !(item.source === node.source && item.albumSlug === node.slug)).map(playlistItemToPlayable);
      addToQueue(shuffleArray(restOfPlaylist));
    }
  }

  function playAllPlaylist() {
    const p = playlistRef.current;
    if (!p || p.items.length === 0) return;
    const all = p.items.map(playlistItemToPlayable);
    const [first, ...rest] = all;
    play(first);
    clearQueue();
    addToQueue(rest);
    setCurrentPlaylist({ slug: p.slug, title: p.title });
  }

  function playLocked() {
    const id = lockedIdRef.current;
    if (id === null) return;
    if (id === -1) {
      playAllPlaylist();
      return;
    }
    const node = nodesRef.current.find((n) => n.id === id);
    if (node) void playAlbum(node);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) keysRef.current.add(e.code);
      if (e.code === "KeyF") playLocked();
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

      // --- crosshair lock-on: nearest node to screen center, including
      // the always-present center "Play all" pseudo-target (id -1) ---
      {
        let nearestId: number | null = null;
        let nearestDist = LOCK_RADIUS;
        const centerDist = Math.hypot(cam.x, cam.y);
        if (centerDist < nearestDist) {
          nearestId = -1;
          nearestDist = centerDist;
        }
        for (const n of nodesRef.current) {
          const dist = Math.hypot(cam.x + n.x, cam.y + n.y);
          if (dist < nearestDist) {
            nearestId = n.id;
            nearestDist = dist;
          }
        }
        if (nearestId !== lockedIdRef.current) {
          lockedIdRef.current = nearestId;
          lockProgressRef.current = 0;
          setLockedId(null);
        } else if (nearestId !== null && lockProgressRef.current < 1) {
          lockProgressRef.current = Math.min(1, lockProgressRef.current + dt / LOCK_TIME);
          if (lockProgressRef.current >= 1) setLockedId(nearestId);
        }
      }

      // --- album covers: wander around home + repel each other ---
      const t = (now / 1000) * controlsRef.current.roamSpeed;
      const nodes = nodesRef.current;
      const repelRadius = REPEL_RADIUS * controlsRef.current.spacing;
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
          if (dist < repelRadius) {
            const push = ((repelRadius - dist) / repelRadius) * REPEL_STRENGTH;
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
          <button className="btn" style={{ position: "absolute", top: 12, left: 12, zIndex: 5 }} onClick={() => navigate(`/playlist/${playlist.slug}/list`)}>
            View as list
          </button>
          {isDesktop && (
            <p style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", zIndex: 5, fontSize: "0.75rem", color: "var(--text-dim)" }}>
              WASD to navigate
            </p>
          )}
          {user?.id === playlist.ownerId && (
            <div style={{ position: "absolute", top: 12, right: 12, zIndex: 5 }}>
              <button className="btn" onClick={() => setSettingsOpen((v) => !v)}>
                ⚙ {settingsOpen ? "Close" : "Settings"}
              </button>
              {settingsOpen && (
                <div
                  style={{
                    marginTop: "0.4rem",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    padding: "0.6rem",
                    borderRadius: "var(--radius)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.4rem",
                    minWidth: 200,
                  }}
                >
                  <div className="field">
                    <label style={{ fontSize: "0.75rem" }}>Cover size — {controls.coverSize}</label>
                    <input type="range" min={32} max={140} value={controls.coverSize} onChange={(e) => updateControl({ coverSize: Number(e.target.value) })} />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: "0.75rem" }}>Background brightness</label>
                    <input type="range" min={0} max={1} step={0.01} value={controls.bgBright} onChange={(e) => updateControl({ bgBright: Number(e.target.value) })} />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: "0.75rem" }}>Background saturation</label>
                    <input type="range" min={0} max={1} step={0.01} value={controls.bgSat} onChange={(e) => updateControl({ bgSat: Number(e.target.value) })} />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: "0.75rem" }}>Background contrast</label>
                    <input type="range" min={0} max={1} step={0.01} value={controls.bgContrast} onChange={(e) => updateControl({ bgContrast: Number(e.target.value) })} />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: "0.75rem" }}>Reacts to audio (RMS)</label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={controls.rmsBrightnessAmount}
                      onChange={(e) => updateControl({ rmsBrightnessAmount: Number(e.target.value) })}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: "0.75rem" }}>Cover spacing</label>
                    <input type="range" min={0.3} max={6} step={0.05} value={controls.spacing} onChange={(e) => updateControl({ spacing: Number(e.target.value) })} />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: "0.75rem" }}>Roaming speed</label>
                    <input type="range" min={0} max={2.5} step={0.05} value={controls.roamSpeed} onChange={(e) => updateControl({ roamSpeed: Number(e.target.value) })} />
                  </div>
                </div>
              )}
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
                width: controls.coverSize * 1.4,
              }}
            >
              <div
                style={{
                  width: controls.coverSize,
                  height: controls.coverSize,
                  margin: "0 auto",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background: a.coverArtUrl ? `url(${a.coverArtUrl}) center/cover` : "var(--bg-elevated)",
                }}
              />
              <div style={{ fontSize: Math.max(9, controls.coverSize * 0.125), marginTop: "0.2rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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

          {/* Always-visible center "Play all" marker, anchored in world space at the origin like any album node */}
          <div
            style={{
              position: "absolute",
              left: `calc(50% + ${cameraRef.current.x}px)`,
              top: `calc(50% + ${cameraRef.current.y}px)`,
              transform: "translate(-50%, -50%)",
              zIndex: 2,
              textAlign: "center",
              pointerEvents: "auto",
              cursor: "pointer",
              color: "var(--text)",
            }}
            onClick={playAllPlaylist}
          >
            <div
              style={{
                width: controls.coverSize * 0.9,
                height: controls.coverSize * 0.9,
                borderRadius: "50%",
                border: "2px solid var(--accent-audio)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--bg-elevated)",
                fontSize: controls.coverSize * 0.35,
              }}
            >
              ▶
            </div>
            <div style={{ fontSize: Math.max(9, controls.coverSize * 0.11), marginTop: "0.15rem" }}>Play all</div>
          </div>

          <div className="space-reticle" ref={reticleRef}>
            <div
              className="space-reticle-ring"
              style={{ background: `conic-gradient(var(--accent-audio) ${lockProgressRef.current * 360}deg, transparent 0deg)` }}
            />
            <div className="space-reticle-cross" />
          </div>

          {lockedId !== null && (
            <p
              onClick={!isDesktop ? playLocked : undefined}
              style={{
                position: "absolute",
                bottom: isDesktop ? 40 : 56,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 5,
                fontSize: "0.85rem",
                color: "var(--accent-audio)",
                textShadow: "0 0 6px var(--accent-audio)",
                cursor: !isDesktop ? "pointer" : undefined,
              }}
            >
              {lockedId === -1 ? "Play all" : nodesRef.current.find((n) => n.id === lockedId)?.title} {isDesktop ? "(F)" : "— tap to play"}
            </p>
          )}

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
