import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAudioStore, shuffleArray } from "../lib/audioStore";
import { useIsDesktop } from "../lib/useIsDesktop";
import { isTypingTarget } from "../lib/isTypingTarget";
import { useSpacemapField, FX_DEFAULTS, type FxSettings } from "../lib/entoptic/useSpacemapField";
import { useMapQualityStore } from "../lib/mapQualityStore";
import { Joystick } from "../components/Joystick";
import type { PlayableTrackDTO } from "../lib/types";
import { spiralOrder, type TrackPoint } from "../lib/vennLayout";
import { layoutConstellationRegions, layoutStars, buildConnectionLines, type ConstellationTrack } from "../lib/constellationLayout";
import { ConstellationScanPanel } from "../components/ConstellationScanPanel";

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
  genres: string[];
  lyrics: string | null;
  trackPosition: number;
}
interface PlaylistDetail {
  id: number;
  slug: string;
  title: string;
  ownerId: number;
  fxSettings: (Partial<FxSettings> & { coverSize?: number; spacing?: number; roamSpeed?: number; vennHueStart?: number; vennHueEnd?: number; vennBlobSize?: number; vennSpacing?: number; vennRepelFactor?: number }) | null;
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

interface StarNode {
  trackId: number;
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  wanderSeed: number;
  regionX: number;
  regionY: number;
  regionTrackCount: number;
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
    genres: item.genres,
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
  const [controls, setControls] = useState({
    coverSize: DEFAULT_COVER_SIZE,
    bgBright: 0.5,
    bgSat: 0.5,
    bgContrast: 0.5,
    rmsBrightnessAmount: 0.3,
    spacing: 1,
    roamSpeed: 1,
    vennHueStart: 260,
    vennHueEnd: 20,
    vennBlobSize: 1,
    vennSpacing: 1,
    vennRepelFactor: 1,
  });
  const [, forceRender] = useState(0);
  const [lockedId, setLockedId] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const mapQuality = useMapQualityStore((s) => s.quality);
  const setMapQuality = useMapQualityStore((s) => s.setQuality);
  const softwareRendererName = useMapQualityStore((s) => s.softwareRendererName);
  const [dismissedSwNotice, setDismissedSwNotice] = useState(false);
  const [viewMode, setViewMode] = useState<"map" | "venn">(() => (window.location.hash === "#venn" ? "venn" : "map"));
  // Persists while playback keeps coming from this playlist - cleared
  // the moment the player switches away, per the explicit requirement
  // that colors survive a requeue from the same playlist but not a
  // switch to something else.
  const [litTrackIds, setLitTrackIds] = useState<Set<number>>(new Set());
  const vennOriginTrackIdRef = useRef<number | null>(null);

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
  const touchDragRef = useRef<{ startClientX: number; startClientY: number; startCamX: number; startCamY: number } | null>(null);
  const pinchRef = useRef<{ startDist: number; startBlobSize: number; startSpacing: number } | null>(null);
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
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
        vennHueStart: p.fxSettings?.vennHueStart ?? 260,
        vennHueEnd: p.fxSettings?.vennHueEnd ?? 20,
        vennBlobSize: p.fxSettings?.vennBlobSize ?? 1,
        vennSpacing: p.fxSettings?.vennSpacing ?? 1,
        vennRepelFactor: p.fxSettings?.vennRepelFactor ?? 1,
      });
    });
  }
  useEffect(reload, [slug]);

  // Updates the visible slider immediately, but debounces the actual save
  // - five sliders each firing a request per drag tick would otherwise
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
  // same place - actual x/y then wander around that point each frame.
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

  const constellationTracks: ConstellationTrack[] = useMemo(
    () => (playlist ? playlist.items.filter((i) => i.genres.length > 0).map((i) => ({ id: i.trackId, genres: i.genres })) : []),
    [playlist],
  );
  const rawRegions = useMemo(() => layoutConstellationRegions(constellationTracks), [constellationTracks]);
  const regions = useMemo(() => rawRegions.map((r) => ({ ...r, x: r.x * controls.vennSpacing, y: r.y * controls.vennSpacing })), [rawRegions, controls.vennSpacing]);
  const stars = useMemo(() => layoutStars(constellationTracks, regions), [constellationTracks, regions]);
  const connectionLines = useMemo(() => buildConnectionLines(stars, regions), [stars, regions]);
  const backgroundStars = useMemo(() => {
    // Purely decorative field-filler, not tied to any genre or track -
    // a real night sky is dense with faint background stars, which is
    // exactly what a pure constellation layout (deliberately sparse and
    // meaningful) can't provide on its own.
    const rand = seededRand(1);
    const list: { x: number; y: number; r: number; o: number }[] = [];
    for (let i = 0; i < 500; i++) {
      list.push({ x: (rand() - 0.5) * 3000, y: (rand() - 0.5) * 3000, r: 0.4 + rand() * rand() * 1.6, o: 0.15 + rand() * 0.5 });
    }
    return list;
  }, []);
  const vennTracks: TrackPoint[] = stars;
  const starByTrackId = useMemo(() => new Map(stars.map((s) => [s.trackId, s])), [stars]);
  const [hoveredTrackId, setHoveredTrackId] = useState<number | null>(null);
  const [crosshairNearTrackId, setCrosshairNearTrackId] = useState<number | null>(null);
  const crosshairNearTrackIdRef = useRef<number | null>(null);
  const [scanPanelItemId, setScanPanelItemId] = useState<number | null>(null);
  const vennTracksRef = useRef(vennTracks);
  useEffect(() => {
    vennTracksRef.current = vennTracks;
  }, [vennTracks]);
  const starNodesRef = useRef<Map<number, StarNode>>(new Map());
  const hoveredTrackIdRef = useRef<number | null>(null);
  hoveredTrackIdRef.current = hoveredTrackId;
  useEffect(() => {
    const regionByName = new Map(regions.map((r) => [r.name, r]));
    const next = new Map<number, StarNode>();
    for (const s of stars) {
      const existing = starNodesRef.current.get(s.trackId);
      const rand = seededRand(hashOf(`starwander:${s.trackId}`));
      const region = regionByName.get(s.rootGenre);
      next.set(s.trackId, {
        trackId: s.trackId,
        homeX: s.x,
        homeY: s.y,
        x: existing ? existing.x : s.x,
        y: existing ? existing.y : s.y,
        wanderSeed: rand() * 1000,
        regionX: region?.x ?? s.x,
        regionY: region?.y ?? s.y,
        regionTrackCount: region?.trackCount ?? 1,
      });
    }
    starNodesRef.current = next;
  }, [stars, regions]);

  // Tracks are marked "lit" the moment they actually become the current
  // track while still playing from this playlist - covers a direct
  // click/F-key play, and also normal queue advancement once the whole
  // spiral-ordered queue is populated (see playVennTrack below), so
  // there's no need to separately intercept "track ended" events.
  // Only the currently-playing track is "lit" at any moment - not an
  // accumulated history of everything played this session. The scan
  // panel follows the same signal: it always reflects whatever's
  // currently playing from this playlist, not just the last thing
  // clicked, and clears when nothing here is playing.
  useEffect(() => {
    return useAudioStore.subscribe((state, prevState) => {
      if (!playlist) return;
      if (state.currentPlaylist?.slug !== playlist.slug || !state.currentTrack) {
        setLitTrackIds((prev) => (prev.size === 0 ? prev : new Set()));
        setScanPanelItemId(null);
        if (state.currentPlaylist?.slug !== playlist.slug) vennOriginTrackIdRef.current = null;
        return;
      }
      if (state.currentTrack.id !== prevState.currentTrack?.id) {
        setLitTrackIds(new Set([state.currentTrack.id]));
        const matchingItem = playlist.items.find((i) => i.trackId === state.currentTrack!.id);
        if (matchingItem) setScanPanelItemId(matchingItem.id);
      }
    });
  }, [playlist]);

  function playVennTrack(item: PlaylistItem) {
    const p = playlistRef.current;
    if (!p) return;
    play(playlistItemToPlayable(item));
    clearQueue();
    setCurrentPlaylist({ slug: p.slug, title: p.title });
    vennOriginTrackIdRef.current = item.trackId;
    // Queues every other track in the playlist (not just a handful),
    // ordered by spiral distance from wherever playback started - the
    // normal queue/ended() flow then walks through this in order, so no
    // separate reactive "pick the next one" logic is needed anymore.
    const order = spiralOrder(vennTracksRef.current, item.trackId);
    const rest = order
      .map((point) => p.items.find((i) => i.trackId === point.trackId))
      .filter((i): i is PlaylistItem => !!i)
      .map(playlistItemToPlayable);
    addToQueue(rest);
  }

  function playAlbum(node: AlbumNode) {
    const p = playlistRef.current;
    if (!p) return;
    const albumItems = p.items
      .filter((item) => item.source === node.source && item.albumSlug === node.slug)
      .sort((a, b) => a.trackPosition - b.trackPosition)
      .map(playlistItemToPlayable);
    if (albumItems.length === 0) return;
    const [first, ...restOfAlbum] = albumItems;
    play(first);
    clearQueue();
    addToQueue(restOfAlbum);

    setCurrentPlaylist({ slug: p.slug, title: p.title });
    // Smart contextualization: once this album finishes, keep playing
    // through the rest of the playlist rather than just stopping -
    // shuffled, and with this album's own tracks excluded so nothing
    // repeats right after it just played.
    const restOfPlaylist = p.items.filter((item) => !(item.source === node.source && item.albumSlug === node.slug)).map(playlistItemToPlayable);
    addToQueue(shuffleArray(restOfPlaylist));
  }

  function playAllPlaylist() {
    const p = playlistRef.current;
    if (!p || p.items.length === 0) return;
    const all = shuffleArray(p.items.map(playlistItemToPlayable));
    const [first, ...rest] = all;
    play(first);
    clearQueue();
    addToQueue(rest);
    setCurrentPlaylist({ slug: p.slug, title: p.title });
  }

  function handleTouchStart(e: React.TouchEvent) {
    if ((e.target as HTMLElement).closest?.(".space-joystick-base")) return;
    if (e.touches.length === 2 && viewModeRef.current === "venn") {
      touchDragRef.current = null;
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchRef.current = { startDist: d, startBlobSize: controlsRef.current.vennBlobSize, startSpacing: controlsRef.current.vennSpacing };
      return;
    }
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    touchDragRef.current = { startClientX: t.clientX, startClientY: t.clientY, startCamX: cameraRef.current.x, startCamY: cameraRef.current.y };
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const ratio = d / pinchRef.current.startDist;
      updateControl({
        vennBlobSize: Math.min(2.5, Math.max(0.4, pinchRef.current.startBlobSize * ratio)),
        vennSpacing: Math.min(2.5, Math.max(0.4, pinchRef.current.startSpacing * ratio)),
      });
      return;
    }
    if (!touchDragRef.current || e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    const drag = touchDragRef.current;
    cameraRef.current.x = drag.startCamX + (t.clientX - drag.startClientX);
    cameraRef.current.y = drag.startCamY + (t.clientY - drag.startClientY);
    cameraRef.current.vx = 0;
    cameraRef.current.vy = 0;
  }
  function handleTouchEnd() {
    touchDragRef.current = null;
    pinchRef.current = null;
  }

  function playLocked() {
    const id = lockedIdRef.current;
    if (id === null) return;
    if (viewModeRef.current === "venn") {
      const p = playlistRef.current;
      const item = p?.items.find((i) => i.trackId === id);
      if (item) {
        playVennTrack(item);
        setScanPanelItemId(item.id);
      }
      return;
    }
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
      // the always-present center "Play all" pseudo-target (id -1) in
      // map mode; in Venn mode locks onto track dot positions instead,
      // with no Play all target since that button is hidden there. ---
      {
        let nearestId: number | null = null;
        let nearestDist = LOCK_RADIUS;
        if (viewModeRef.current === "venn") {
          for (const t of vennTracksRef.current) {
            const dist = Math.hypot(cam.x + t.x, cam.y + t.y);
            if (dist < nearestDist) {
              nearestId = t.trackId;
              nearestDist = dist;
            }
          }
          if (nearestId !== crosshairNearTrackIdRef.current) {
            crosshairNearTrackIdRef.current = nearestId;
            setCrosshairNearTrackId(nearestId);
          }
        } else {
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

      // --- constellation stars: same wander-around-home + repel
      // pattern as album covers, but frozen for whichever star is
      // currently hovered (mouse or crosshair) so it's easy to read
      // and click precisely rather than chasing a moving target. ---
      if (viewModeRef.current === "venn") {
        const starNodes = starNodesRef.current;
        const frozenId = hoveredTrackIdRef.current ?? crosshairNearTrackIdRef.current;
        const starRepelRadius = 34 * controlsRef.current.vennRepelFactor;
        const trackOrbBase = 9 * (controlsRef.current.vennBlobSize / 1.2 + 0.4);
        for (const n of starNodes.values()) {
          if (n.trackId === frozenId) continue;
          const wanderX = Math.sin(t * 0.4 + n.wanderSeed) * 22;
          const wanderY = Math.cos(t * 0.33 + n.wanderSeed) * 22;
          const targetX = n.homeX + wanderX;
          const targetY = n.homeY + wanderY;
          let fx = (targetX - n.x) * SPRING;
          let fy = (targetY - n.y) * SPRING;
          // Orbit, don't overlap: the region's own star can be quite
          // large (8x a track orb, growing with track count), so keep
          // every track orb clear of it rather than letting them drift
          // on top of it.
          const regionStarRadius = (trackOrbBase * 8 * Math.pow(1.07, Math.max(0, n.regionTrackCount - 1))) / 2;
          const clearance = regionStarRadius + 14;
          const rdx = n.x - n.regionX;
          const rdy = n.y - n.regionY;
          const rdist = Math.sqrt(rdx * rdx + rdy * rdy) || 0.001;
          if (rdist < clearance) {
            const push = ((clearance - rdist) / clearance) * REPEL_STRENGTH * 0.6;
            fx += (rdx / rdist) * push;
            fy += (rdy / rdist) * push;
          }
          if (controlsRef.current.vennRepelFactor > 0) {
            for (const other of starNodes.values()) {
              if (other === n) continue;
              const dx = n.x - other.x;
              const dy = n.y - other.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
              if (dist < starRepelRadius) {
                const push = ((starRepelRadius - dist) / starRepelRadius) * REPEL_STRENGTH * 0.5;
                fx += (dx / dist) * push;
                fy += (dy / dist) * push;
              }
            }
          }
          n.x += (fx / DAMPING) * dt;
          n.y += (fy / DAMPING) * dt;
        }
        vennTracksRef.current = [...starNodes.values()].map((n) => ({ trackId: n.trackId, x: n.x, y: n.y, genres: [] }));
      }

      forceRender((v) => (v + 1) % 1000000);
      frameId = requestAnimationFrame(frame);
    }
    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, []);

  // Off-screen compass arrows - same pattern as the main spacemap.
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
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
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
          <div style={{ position: "absolute", top: 12, left: 12, right: 90, zIndex: 5, display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}>
            <button className="btn" onClick={() => navigate(`/playlist/${playlist.slug}/list`)}>
              View as list
            </button>
            <button
              className="btn"
              style={viewMode === "venn" ? { outline: "1px solid var(--accent-forum)" } : undefined}
              onClick={() =>
                setViewMode((m) => {
                  const next = m === "venn" ? "map" : "venn";
                  history.replaceState(null, "", next === "venn" ? "#venn" : window.location.pathname);
                  return next;
                })
              }
            >
              View as constellation
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", background: "var(--bg-elevated)", padding: "0.2rem 0.5rem", borderRadius: "var(--radius)" }}>
              <label style={{ fontSize: "0.7rem", color: "var(--text-dim)" }} title="Lower this if the map feels laggy">
                Quality
              </label>
              <select value={mapQuality} onChange={(e) => setMapQuality(Number(e.target.value))} style={{ fontSize: "0.7rem", padding: "0.1rem" }}>
                <option value={0.2}>Potato</option>
                <option value={0.4}>Low</option>
                <option value={0.6}>Medium</option>
                <option value={1}>High</option>
                <option value={1.5}>Ultra</option>
              </select>
            </div>
          </div>
          {softwareRendererName && !dismissedSwNotice && (
            <div
              style={{
                position: "absolute",
                top: 52,
                left: 12,
                zIndex: 5,
                maxWidth: 280,
                background: "var(--bg-elevated)",
                border: "1px solid var(--accent-forum)",
                borderRadius: "var(--radius)",
                padding: "0.5rem 0.6rem",
                fontSize: "0.72rem",
                color: "var(--text-dim)",
              }}
            >
              <button
                onClick={() => setDismissedSwNotice(true)}
                style={{ float: "right", background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "0.8rem", lineHeight: 1 }}
                title="Dismiss"
              >
                ×
              </button>
              Your browser is rendering this without hardware acceleration, which is slow - quality's been dropped
              automatically. This is a browser/GPU setting, not something this site controls.
            </div>
          )}
          {isDesktop && (
            <p style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", zIndex: 5, fontSize: "0.75rem", color: "var(--text-dim)" }}>
              WASD to navigate
            </p>
          )}
          {user?.id === playlist.ownerId && (
            <div style={{ position: "absolute", bottom: 12, right: 12, zIndex: 5, display: "flex", flexDirection: "column-reverse", alignItems: "flex-end" }}>
              <button className="btn" onClick={() => setSettingsOpen((v) => !v)}>
                ⚙ {settingsOpen ? "Close" : "Settings"}
              </button>
              {settingsOpen && (
                <div
                  style={{
                    marginBottom: "0.4rem",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    padding: "0.6rem",
                    borderRadius: "var(--radius)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.4rem",
                    minWidth: 200,
                    maxHeight: "70vh",
                    overflowY: "auto",
                  }}
                >
                  <div className="field">
                    <label style={{ fontSize: "0.75rem" }}>Cover size - {controls.coverSize}</label>
                    <input type="range" min={20} max={260} value={controls.coverSize} onChange={(e) => updateControl({ coverSize: Number(e.target.value) })} />
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
                    <input type="range" min={0} max={6} step={0.05} value={controls.roamSpeed} onChange={(e) => updateControl({ roamSpeed: Number(e.target.value) })} />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: "0.75rem" }}>Venn Views color start (hue)</label>
                    <input type="range" min={0} max={360} step={1} value={controls.vennHueStart} onChange={(e) => updateControl({ vennHueStart: Number(e.target.value) })} />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: "0.75rem" }}>Venn Views color end (hue)</label>
                    <input type="range" min={0} max={360} step={1} value={controls.vennHueEnd} onChange={(e) => updateControl({ vennHueEnd: Number(e.target.value) })} />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: "0.75rem" }}>Star/label size</label>
                    <input type="range" min={0.15} max={6} step={0.05} value={controls.vennBlobSize} onChange={(e) => updateControl({ vennBlobSize: Number(e.target.value) })} />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: "0.75rem" }}>Constellation spacing</label>
                    <input type="range" min={0.15} max={6} step={0.05} value={controls.vennSpacing} onChange={(e) => updateControl({ vennSpacing: Number(e.target.value) })} />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: "0.75rem" }} title="How strongly stars push each other apart to avoid clustering">
                      De-cluttering
                    </label>
                    <input type="range" min={0} max={6} step={0.05} value={controls.vennRepelFactor} onChange={(e) => updateControl({ vennRepelFactor: Number(e.target.value) })} />
                  </div>
                </div>
              )}
            </div>
          )}

          {viewMode === "map" && (
            <>
          {nodesRef.current.map((a) => {
            const isPlayingAlbum = currentTrack?.albumSlug === a.slug;
            const size = isPlayingAlbum ? controls.coverSize * 1.3 : controls.coverSize;
            return (
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
                  color: isPlayingAlbum ? "#fff" : "var(--text)",
                  width: controls.coverSize * 1.4,
                }}
              >
                <div
                  style={{
                    width: size,
                    height: size,
                    margin: "0 auto",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                    background: a.coverArtUrl ? `url(${a.coverArtUrl}) center/cover` : "var(--bg-elevated)",
                    transition: "width 0.25s ease, height 0.25s ease",
                  }}
                />
                <div
                  style={{
                    fontSize: Math.max(9, controls.coverSize * 0.125),
                    marginTop: "0.2rem",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    textShadow: isPlayingAlbum ? "0 0 6px #fff" : undefined,
                  }}
                >
                  {a.title}
                </div>
              </Link>
            );
          })}

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
            </>
          )}

          {viewMode === "venn" && (
            <>
              <svg
                style={{ position: "absolute", left: "50%", top: "50%", overflow: "visible", zIndex: 0, pointerEvents: "none", width: 1, height: 1 }}
              >
                <g transform={`translate(${cameraRef.current.x}, ${cameraRef.current.y})`}>
                  {backgroundStars.map((s, i) => (
                    <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />
                  ))}
                </g>
              </svg>
              <svg
                style={{ position: "absolute", left: "50%", top: "50%", overflow: "visible", zIndex: 1, pointerEvents: "none", width: 1, height: 1 }}
              >
                <g transform={`translate(${cameraRef.current.x}, ${cameraRef.current.y})`}>
                  <defs>
                    <filter id="starGlow" x="-200%" y="-200%" width="500%" height="500%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  {connectionLines.map((l, i) => {
                    const isCross = l.kind === "cross-genre";
                    const lit = litTrackIds.has(l.trackId);
                    const hovered = hoveredTrackId === l.trackId || crosshairNearTrackId === l.trackId;
                    const opacity = isCross ? (lit ? 0.95 : hovered ? 0.55 : 0) : 0.24;
                    if (opacity === 0) return null;
                    const fromLive = starNodesRef.current.get(l.trackId);
                    const toLive = l.toTrackId !== null ? starNodesRef.current.get(l.toTrackId) : null;
                    return (
                      <line
                        key={i}
                        x1={fromLive?.x ?? l.fromX}
                        y1={fromLive?.y ?? l.fromY}
                        x2={toLive?.x ?? l.toX}
                        y2={toLive?.y ?? l.toY}
                        stroke={isCross ? "#4fd4c4" : "#8fb8ff"}
                        strokeWidth={isCross && lit ? 1.6 : 1}
                        opacity={opacity}
                        filter={isCross && lit ? "url(#starGlow)" : undefined}
                        style={{ transition: "opacity 0.25s" }}
                      />
                    );
                  })}
                </g>
              </svg>

              {regions.map((r) => {
                const trackOrbBase = 9 * (controls.vennBlobSize / 1.2 + 0.4);
                const starSize = trackOrbBase * 8 * Math.pow(1.07, Math.max(0, r.trackCount - 1));
                const rand = seededRand(hashOf(`starlook:${r.name}`));
                // Real starlight varies a lot in perceived brightness and
                // has a subtle color temperature - a field of uniformly
                // bright, uniformly white circles reads as artificial no
                // matter how organically they're placed.
                const brightness = 0.45 + rand() * 0.55;
                const warmth = rand(); // 0 = cool blue-white, 1 = warm white
                const core = warmth > 0.5 ? "#fff8ec" : "#eaf3ff";
                const mid = warmth > 0.5 ? "#ffe9c2" : "#cfe8ff";
                const hasSpikes = brightness > 0.75;
                return (
                  <div key={r.name}>
                    {hasSpikes && (
                      <>
                        <div
                          style={{
                            position: "absolute",
                            left: `calc(50% + ${cameraRef.current.x + r.x}px)`,
                            top: `calc(50% + ${cameraRef.current.y + r.y}px)`,
                            transform: "translate(-50%, -50%)",
                            width: starSize * 4.2,
                            height: 1.5,
                            background: `linear-gradient(90deg, transparent, rgba(255,255,255,${brightness * 0.55}) 45%, rgba(255,255,255,${brightness * 0.85}) 50%, rgba(255,255,255,${brightness * 0.55}) 55%, transparent)`,
                            zIndex: 2,
                            pointerEvents: "none",
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            left: `calc(50% + ${cameraRef.current.x + r.x}px)`,
                            top: `calc(50% + ${cameraRef.current.y + r.y}px)`,
                            transform: "translate(-50%, -50%)",
                            width: 1.5,
                            height: starSize * 4.2,
                            background: `linear-gradient(180deg, transparent, rgba(255,255,255,${brightness * 0.55}) 45%, rgba(255,255,255,${brightness * 0.85}) 50%, rgba(255,255,255,${brightness * 0.55}) 55%, transparent)`,
                            zIndex: 2,
                            pointerEvents: "none",
                          }}
                        />
                      </>
                    )}
                    <div
                      title={`${r.name} - ${r.trackCount} track${r.trackCount === 1 ? "" : "s"}`}
                      style={{
                        position: "absolute",
                        left: `calc(50% + ${cameraRef.current.x + r.x}px)`,
                        top: `calc(50% + ${cameraRef.current.y + r.y}px)`,
                        transform: "translate(-50%, -50%)",
                        width: starSize,
                        height: starSize,
                        borderRadius: "50%",
                        opacity: brightness,
                        background: `radial-gradient(circle, ${core} 0%, ${mid} 35%, rgba(143, 184, 255, 0.15) 75%, transparent 100%)`,
                        boxShadow: `0 0 ${starSize * 0.9}px ${starSize * 0.25}px rgba(180, 210, 255, ${0.35 * brightness})`,
                        zIndex: 2,
                        pointerEvents: "none",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        left: `calc(50% + ${cameraRef.current.x + r.x}px)`,
                        top: `calc(50% + ${cameraRef.current.y + r.y + starSize * 0.65 + 10}px)`,
                        transform: "translate(-50%, -50%)",
                        fontSize: `${Math.max(0.6, Math.min(1.15, controls.vennBlobSize * (0.75 + Math.sqrt(r.trackCount) * 0.05)))}rem`,
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        color: "#eaf6ff",
                        textShadow: "0 0 4px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.6)",
                        zIndex: 2,
                        pointerEvents: "none",
                        whiteSpace: "nowrap",
                        textTransform: "uppercase",
                      }}
                    >
                      {r.name}
                    </div>
                  </div>
                );
              })}

              {playlist.items.map((item) => {
                const point = starNodesRef.current.get(item.trackId) ?? starByTrackId.get(item.trackId);
                if (!point) return null;
                const lit = litTrackIds.has(item.trackId);
                const hovered = hoveredTrackId === item.trackId || crosshairNearTrackId === item.trackId;
                const hue = controls.vennHueStart + ((controls.vennHueEnd - controls.vennHueStart) * (hashOf(item.title) % 100)) / 100;
                const trackBrightness = 0.55 + seededRand(hashOf(`tracklook:${item.trackId}`))() * 0.45;
                const size = (lit ? 14 : hovered ? 12 : 9) * (controls.vennBlobSize / 1.2 + 0.4);
                return (
                  <button
                    key={item.id}
                    title={item.title}
                    onMouseEnter={() => setHoveredTrackId(item.trackId)}
                    onMouseLeave={() => setHoveredTrackId((id) => (id === item.trackId ? null : id))}
                    onClick={() => {
                      playVennTrack(item);
                      setScanPanelItemId(item.id);
                    }}
                    style={{
                      position: "absolute",
                      left: `calc(50% + ${cameraRef.current.x + point.x}px)`,
                      top: `calc(50% + ${cameraRef.current.y + point.y}px)`,
                      transform: "translate(-50%, -50%)",
                      width: size,
                      height: size,
                      borderRadius: "50%",
                      border: "none",
                      cursor: "pointer",
                      zIndex: 3,
                      opacity: lit || hovered ? 1 : trackBrightness,
                      background: lit ? `hsl(${hue}, 85%, 82%)` : `hsl(${hue}, 55%, 65%)`,
                      boxShadow: lit ? `0 0 10px 3px hsla(${hue}, 85%, 80%, 0.8)` : hovered ? `0 0 6px 1px hsla(${hue}, 70%, 70%, 0.6)` : "none",
                      transition: "width 0.15s, height 0.15s, box-shadow 0.2s",
                    }}
                  />
                );
              })}

              {scanPanelItemId &&
                (() => {
                  const item = playlist.items.find((i) => i.id === scanPanelItemId);
                  if (!item) return null;
                  return (
                    <ConstellationScanPanel
                      title={item.title}
                      composer={item.composer ?? ""}
                      rootGenre={item.genres[0] ?? ""}
                      genres={item.genres}
                      description={item.lyrics}
                      onClose={() => setScanPanelItemId(null)}
                    />
                  );
                })()}
            </>
          )}

          {/* Always-visible center "Play all" marker, anchored in world space at the origin like any album node - map mode only, since Venn mode has its own play entry points */}
          {viewMode === "map" && (
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
          )}
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
              {viewMode === "venn"
                ? playlist.items.find((i) => i.trackId === lockedId)?.title
                : lockedId === -1
                  ? "Play all"
                  : nodesRef.current.find((n) => n.id === lockedId)?.title}{" "}
              {isDesktop ? "(F)" : "- tap to play"}
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
