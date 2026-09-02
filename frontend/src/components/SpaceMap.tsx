import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Branch } from "../lib/types";
import { useIsDesktop } from "../lib/useIsDesktop";
import { isTypingTarget } from "../lib/isTypingTarget";
import { useChatDockStore } from "../lib/chatDockStore";
import { useAmbienceStore } from "../lib/ambienceStore";
import { GaplessLoop } from "../lib/GaplessLoop";
import { Joystick } from "./Joystick";
import { useVolumeMixerStore } from "../lib/volumeMixerStore";
import { useSpacemapField, pointerRef, cameraOffsetRef, wardenBridge } from "../lib/entoptic/useSpacemapField";
import { useFxSettings } from "../lib/entoptic/useFxSettings";
import { useAudioStore } from "../lib/audioStore";
import { api } from "../lib/api";
import type { PlayableTrackDTO } from "../lib/types";

interface MapNode {
  id: number;
  slug: string;
  name: string;
  parentId: number | null;
  isAnchor: boolean;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  angle: number;
  orbitRadius: number;
  orbitSpeed: number;
  wanderSeed: number;
}

const WORLD_SPREAD = 1400; // how far anchors can scatter from center
const REPEL_RADIUS = 90;
const REPEL_STRENGTH = 2400;
const SPRING = 3.5;
const DAMPING = 4.5;
const CAMERA_ACCEL = 1800;
const CAMERA_FRICTION = 5;
const CAMERA_MAX_SPEED = 900;
const LOCK_RADIUS = 58; // px from screen center to start locking on
const LOCK_TIME = 0.9; // seconds of holding a target to complete the lock

function buildNodes(branches: Branch[]): MapNode[] {
  const centralOrbiters = branches.filter((b) => !b.parentId && !b.isAnchor);
  const anchors = branches.filter((b) => !b.parentId && b.isAnchor);
  const children = branches.filter((b) => !!b.parentId);

  const nodes: MapNode[] = [];

  centralOrbiters.forEach((b, i) => {
    const radius = 160 + (i % 5) * 70;
    nodes.push({
      id: b.id,
      slug: b.slug,
      name: b.name,
      parentId: null,
      isAnchor: false,
      x: 0,
      y: 0,
      homeX: 0,
      homeY: 0,
      angle: (i / Math.max(centralOrbiters.length, 1)) * Math.PI * 2,
      orbitRadius: radius,
      orbitSpeed: 0.05 + Math.random() * 0.04,
      wanderSeed: Math.random() * 1000,
    });
  });

  anchors.forEach((b) => {
    // Uneven scatter — not a clean grid or perfect circle, deliberately.
    const angle = Math.random() * Math.PI * 2;
    const radius = 350 + Math.random() * WORLD_SPREAD;
    const bx = Math.cos(angle) * radius;
    const by = Math.sin(angle) * radius;
    nodes.push({
      id: b.id,
      slug: b.slug,
      name: b.name,
      parentId: null,
      isAnchor: true,
      x: bx,
      y: by,
      homeX: bx,
      homeY: by,
      angle: 0,
      orbitRadius: 0,
      orbitSpeed: 0,
      wanderSeed: Math.random() * 1000,
    });
  });

  children.forEach((b, i) => {
    nodes.push({
      id: b.id,
      slug: b.slug,
      name: b.name,
      parentId: b.parentId,
      isAnchor: false,
      x: 0,
      y: 0,
      homeX: 0,
      homeY: 0,
      angle: (i / 3) * Math.PI * 2,
      orbitRadius: 60 + (i % 3) * 30,
      orbitSpeed: 0.08 + Math.random() * 0.06,
      wanderSeed: Math.random() * 1000,
    });
  });

  return nodes;
}

export function SpaceMap({ branches, centerLabel, centerHref }: { branches: Branch[]; centerLabel: string; centerHref: string }) {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const play = useAudioStore((s) => s.play);
  const addToQueue = useAudioStore((s) => s.addToQueue);
  const clearQueue = useAudioStore((s) => s.clearQueue);
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const ambienceEnabled = useAmbienceStore((s) => s.enabled);
  const setAmbienceEnabled = useAmbienceStore((s) => s.setEnabled);

  async function shufflePlay() {
    const tracks = await api<PlayableTrackDTO[]>("/api/tracks/shuffle");
    if (tracks.length === 0) return;
    const [first, ...rest] = tracks;
    play(first);
    addToQueue(rest);
  }
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<MapNode[]>([]);
  const [renderTick, setRenderTick] = useState(0);
  const cameraRef = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const keysRef = useRef<Set<string>>(new Set());
  const joystickVectorRef = useRef({ x: 0, y: 0 });
  const hoveredIdRef = useRef<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; camX: number; camY: number } | null>(null);
  const frameRef = useRef<number | undefined>(undefined);

  // --- reticle lock-on ---
  const targetNodeIdRef = useRef<number | null>(null);
  const lockProgressRef = useRef(0);
  const [lockedNode, setLockedNode] = useState<MapNode | null>(null);
  const lockedNodeRef = useRef<MapNode | null>(null);
  useEffect(() => {
    lockedNodeRef.current = lockedNode;
  }, [lockedNode]);
  const branchesRef = useRef<Branch[]>(branches);
  useEffect(() => {
    branchesRef.current = branches;
  }, [branches]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [actionRevealedCount, setActionRevealedCount] = useState(0);
  const openChat = useChatDockStore((s) => s.openChat);

  const scanSfxRef = useRef<GaplessLoop | null>(null);
  const [scanSfxUrl, setScanSfxUrl] = useState<string | null>(null);

  useEffect(() => {
    api<{ scanSfxUrl: string | null }>("/api/site-settings").then((s) => setScanSfxUrl(s.scanSfxUrl));
  }, []);

  // Fully tears down the audio graph on unmount — leaving the browser to
  // garbage-collect an Audio element on its own schedule (the previous
  // approach) is exactly what let the loop keep sounding after navigating
  // away and back.
  useEffect(() => {
    return () => scanSfxRef.current?.dispose();
  }, []);

  function enterCenter() {
    if (lockedNodeRef.current?.id === -1) navigate(centerHref);
  }

  function viewLockedDetails() {
    const node = lockedNodeRef.current;
    if (!node || node.id === -1) return;
    navigate(`/branch/${node.slug}`);
  }

  function openLockedChat() {
    const node = lockedNodeRef.current;
    if (!node || node.id === -1) return;
    if (!isDesktop) {
      navigate(`/branch/${node.slug}`);
      return;
    }
    const branch = branchesRef.current.find((b) => b.slug === node.slug);
    if (branch?.channel) openChat(branch.channel.slug, branch.name, branch.slug);
  }

  async function shuffleLockedBranch() {
    const node = lockedNodeRef.current;
    if (!node || node.id === -1) return;
    const tracks = await api<PlayableTrackDTO[]>(`/api/branches/${node.slug}/tracks/shuffle`);
    if (tracks.length === 0) return;
    clearQueue();
    const [first, ...rest] = tracks;
    play(first);
    addToQueue(rest);
  }

  useEffect(() => {
    nodesRef.current = buildNodes(branches);
  }, [branches]);

  const ACTION_SEGMENTS = [
    { text: isDesktop ? "Chat (E)" : "Chat", color: "var(--accent-forum)", action: openLockedChat },
    { text: "  |  ", color: undefined, action: null },
    { text: isDesktop ? "Play (F)" : "Play", color: "var(--accent-audio)", action: () => void shuffleLockedBranch() },
    { text: "  |  ", color: undefined, action: null },
    { text: isDesktop ? "Details (T)" : "Details", color: "var(--accent-danger)", action: viewLockedDetails },
  ] as const;
  const ACTION_HINT = ACTION_SEGMENTS.map((s) => s.text).join("");
  const CENTER_ACTION_TEXT = isDesktop ? "Enter (Enter)" : "Enter";
  const currentActionLength = lockedNode?.id === -1 ? CENTER_ACTION_TEXT.length : ACTION_HINT.length;

  useEffect(() => {
    if (!lockedNode) return;
    setRevealedCount(0);
    setActionRevealedCount(0);
    const interval = setInterval(() => {
      setRevealedCount((prev) => {
        if (prev >= lockedNode.name.length) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 45);
    return () => clearInterval(interval);
  }, [lockedNode]);

  useEffect(() => {
    if (!lockedNode || revealedCount < lockedNode.name.length) return;
    setActionRevealedCount(0);
    const interval = setInterval(() => {
      setActionRevealedCount((prev) => {
        if (prev >= currentActionLength) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 30);
    return () => clearInterval(interval);
  }, [lockedNode, revealedCount]);

  const wasRevealingRef = useRef(false);
  useEffect(() => {
    if (!scanSfxUrl) return;
    const isRevealing = !!lockedNode && (revealedCount < lockedNode.name.length || actionRevealedCount < currentActionLength);
    if (isRevealing === wasRevealingRef.current) return; // no state change — don't re-trigger the fade
    wasRevealingRef.current = isRevealing;

    if (!scanSfxRef.current) scanSfxRef.current = new GaplessLoop();
    const loop = scanSfxRef.current;

    if (isRevealing) {
      loop.play(scanSfxUrl).then(() => {
        if (wasRevealingRef.current) loop.fadeTo(0.4 * useVolumeMixerStore.getState().sfx); // still wanted by the time loading finished
      });
    } else {
      loop.fadeTo(0);
    }
  }, [scanSfxUrl, lockedNode, revealedCount, actionRevealedCount]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      // event.code is the physical key position, not the character it
      // produces — "KeyW" is always the key at the WASD spot regardless of
      // layout, so this is ZQSD on an AZERTY keyboard for free, with no
      // separate layout detection needed.
      if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) {
        keysRef.current.add(e.code);
      } else if (e.code === "KeyE") {
        openLockedChat();
      } else if (e.code === "KeyF") {
        void shuffleLockedBranch();
      } else if (e.code === "KeyT") {
        viewLockedDetails();
      } else if (e.code === "Enter") {
        enterCenter();
      } else if (e.code === "KeyR") {
        cameraRef.current = { x: 0, y: 0, vx: 0, vy: 0 };
      }
    }
    function handleKeyUp(e: KeyboardEvent) {
      keysRef.current.delete(e.code);
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    let lastTime = performance.now();
    let frameCount = 0;

    function tick(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // --- camera: WASD acceleration + friction (inertia) ---
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
      if (!dragRef.current) {
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
      }
      cameraOffsetRef.x = cam.x;
      cameraOffsetRef.y = cam.y;

      // --- nodes: orbit/wander home position, spring + repulsion ---
      const nodes = nodesRef.current;
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const t = now / 1000;

      for (const n of nodes) {
        if (n.id === hoveredIdRef.current || n.id === targetNodeIdRef.current) continue; // frozen while hovered or under the reticle

        if (n.parentId !== null) {
          const parent = byId.get(n.parentId);
          n.angle += n.orbitSpeed * dt;
          if (parent) {
            n.homeX = parent.x + Math.cos(n.angle) * n.orbitRadius;
            n.homeY = parent.y + Math.sin(n.angle) * n.orbitRadius;
          }
        }
        // Anchors: homeX/homeY intentionally untouched here — they stay at
        // their scattered base spot; the wander offset below is what
        // actually moves them, gently, around that fixed point.
        else if (!n.isAnchor) {
          n.angle += n.orbitSpeed * dt;
          n.homeX = Math.cos(n.angle) * n.orbitRadius;
          n.homeY = Math.sin(n.angle) * n.orbitRadius;
        }

        const wanderX = n.isAnchor ? Math.sin(t * 0.3 + n.wanderSeed) * 18 : 0;
        const wanderY = n.isAnchor ? Math.cos(t * 0.25 + n.wanderSeed) * 18 : 0;
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

      // --- reticle lock-on: nearest top-level node (or the center) to screen center ---
      const box = containerRef.current;
      if (box) {
        const w = box.clientWidth;
        const h = box.clientHeight;
        let nearest: MapNode | null = null;
        let nearestDist = LOCK_RADIUS;

        const centerDist = Math.hypot(cam.x, cam.y);
        if (centerDist < nearestDist) {
          nearestDist = centerDist;
          nearest = {
            id: -1,
            slug: "",
            name: centerLabel,
            parentId: null,
            isAnchor: false,
            x: 0,
            y: 0,
            homeX: 0,
            homeY: 0,
            angle: 0,
            orbitRadius: 0,
            orbitSpeed: 0,
            wanderSeed: 0,
          };
        }
        for (const n of nodes) {
          const screenX = w / 2 + cam.x + n.x;
          const screenY = h / 2 + cam.y + n.y;
          wardenBridge.setScreenPosition(n.id, screenX, screenY);
          const dist = Math.hypot(screenX - w / 2, screenY - h / 2);
          if (dist < nearestDist) {
            nearest = n;
            nearestDist = dist;
          }
        }

        if (nearest?.id !== targetNodeIdRef.current) {
          targetNodeIdRef.current = nearest?.id ?? null;
          lockProgressRef.current = 0;
          setLockedNode(null);
          setRevealedCount(0);
        } else if (nearest && lockProgressRef.current < 1) {
          lockProgressRef.current = Math.min(1, lockProgressRef.current + dt / LOCK_TIME);
          if (lockProgressRef.current >= 1) {
            setLockedNode(nearest);
          }
        }
      }

      // Re-render roughly 30fps worth of React updates — the physics loop
      // itself still runs every animation frame for smoothness.
      frameCount++;
      if (frameCount % 2 === 0) setRenderTick((v) => v + 1);

      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  function handleJoystickMove(x: number, y: number) {
    joystickVectorRef.current = { x, y };
  }
  function handleJoystickRelease() {
    joystickVectorRef.current = { x: 0, y: 0 };
  }

  const scale = isDesktop ? 2 : 1.5;

  const fxSettings = useFxSettings();

  useEffect(() => {
    wardenBridge.bindToBranches(branches.map((b) => ({ id: b.id, slug: b.slug })));
  }, [branches]);
  const { containerRef: fieldContainerRef, fieldCanvasRef, wardenCanvasRef, overlayCanvasRef } = useSpacemapField(fxSettings);

  useEffect(() => {
    const el = fieldContainerRef.current;
    if (!el) return;
    function handleMove(e: MouseEvent) {
      const rect = el!.getBoundingClientRect();
      pointerRef.x = e.clientX - rect.left - rect.width / 2;
      pointerRef.y = rect.height / 2 - (e.clientY - rect.top);
    }
    el.addEventListener("mousemove", handleMove);
    return () => el.removeEventListener("mousemove", handleMove);
  }, [fieldContainerRef]);


  function openDonate() {
    window.open("https://paypal.me/tachybunker", "_blank", "popup=1,width=460,height=640");
  }

  // Compass: top-level nodes (central-cluster + anchors) currently outside
  // the visible container get a small arrow at the edge pointing toward
  // them, so an anchor scattered far away is never truly "lost". Orbiting
  // children are skipped — they stay near their visible parent anyway, and
  // an arrow per satellite would just be clutter.
  const container = containerRef.current;
  const compassPoints: { angle: number; label: string; playing: boolean }[] = [];
  if (container) {
    const w = container.clientWidth;
    const h = container.clientHeight;
    for (const n of nodesRef.current) {
      if (n.parentId !== null) continue;
      const screenX = w / 2 + cameraRef.current.x + n.x;
      const screenY = h / 2 + cameraRef.current.y + n.y;
      if (screenX < 0 || screenX > w || screenY < 0 || screenY > h) {
        compassPoints.push({ angle: Math.atan2(screenY - h / 2, screenX - w / 2), label: n.name, playing: currentTrack?.branchSlug === n.slug });
      }
    }
  }

  const [isFullscreen, setIsFullscreen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      wrapperRef.current?.requestFullscreen().catch(() => {});
    }
  }

  return (
    <>
      {!isDesktop && (
        <button className="btn space-donate-top" onClick={openDonate}>
          💛 Donate
        </button>
      )}
      <div className="space-map-wrapper" ref={wrapperRef}>
      <div
        className="space-map"
        tabIndex={0}
        ref={containerRef}
        style={{ "--space-scale": scale } as React.CSSProperties}
      >
        <button className="btn space-map-fullscreen" onClick={toggleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
          {isFullscreen ? "⤡" : "⤢"}
        </button>
        <div ref={fieldContainerRef} className="space-map-entoptic-field">
          <canvas ref={fieldCanvasRef} />
          <canvas ref={wardenCanvasRef} />
          <canvas ref={overlayCanvasRef} />
        </div>
        <div
          className="space-map-field"
          style={{ transform: `translate(${cameraRef.current.x}px, ${cameraRef.current.y}px)` }}
        >
          <div className="space-node space-node-center" onClick={() => navigate(centerHref)} style={{ left: 0, top: 0 }}>
            {centerLabel}
        </div>

        {nodesRef.current.map((n) => {
          const isPlaying = currentTrack?.branchSlug === n.slug;
          return (
            <div
              key={n.id}
              className={`space-node ${n.isAnchor ? "space-node-anchor" : ""} ${isPlaying ? "space-node-playing" : ""}`}
              style={{ left: n.x, top: n.y, opacity: 0 }}
              onMouseEnter={() => {
                hoveredIdRef.current = n.id;
                setHoveredId(n.id);
              }}
              onMouseLeave={() => {
                hoveredIdRef.current = null;
                setHoveredId(null);
              }}
              onClick={() => navigate(`/branch/${n.slug}`)}
            >
              {n.name}
              {hoveredId === n.id && <span className="space-node-frozen-dot" />}
              {isPlaying &&
                [0, 1, 2].map((i) => <span key={i} className="space-node-particle" style={{ animationDelay: `${i * 0.6}s` }} />)}
            </div>
          );
        })}
      </div>

      {compassPoints.map((c, i) => (
        <div
          key={i}
          className="space-compass-arrow"
          title={c.label}
          style={{
            left: `${50 + Math.cos(c.angle) * 46}%`,
            top: `${50 + Math.sin(c.angle) * 46}%`,
            transform: `translate(-50%, -50%) rotate(${c.angle}rad)`,
            color: c.playing ? "var(--accent-audio)" : undefined,
            textShadow: c.playing ? "0 0 6px var(--accent-audio)" : undefined,
          }}
        >
          ➤
        </div>
      ))}

      <div className="space-reticle">
        <div
          className="space-reticle-ring"
          style={{
            background: `conic-gradient(var(--accent-audio) ${lockProgressRef.current * 360}deg, transparent 0deg)`,
          }}
        />
        <div className="space-reticle-cross" />
      </div>

      {lockedNode && (
        <div className="space-hud-name">
          {lockedNode.name.slice(0, revealedCount)}
          {revealedCount < lockedNode.name.length && <span className="space-hud-cursor">▌</span>}
        </div>
      )}
      {lockedNode && revealedCount >= lockedNode.name.length && actionRevealedCount > 0 && (
        <div className="space-hud-action">
          {lockedNode.id === -1 ? (
            <span
              className="space-hud-action-link"
              style={{ color: "var(--accent-audio)" }}
              onClick={(e) => {
                e.stopPropagation();
                enterCenter();
              }}
            >
              {CENTER_ACTION_TEXT.slice(0, actionRevealedCount)}
            </span>
          ) : (
            (() => {
            let offset = 0;
            return ACTION_SEGMENTS.map((seg, i) => {
              const segStart = offset;
              const segEnd = offset + seg.text.length;
              offset = segEnd;
              if (actionRevealedCount >= segEnd && seg.action) {
                return (
                  <span
                    key={i}
                    className="space-hud-action-link"
                    style={{ color: seg.color }}
                    onClick={(e) => {
                      e.stopPropagation();
                      seg.action!();
                    }}
                  >
                    {seg.text}
                  </span>
                );
              }
              const visible = Math.max(0, Math.min(seg.text.length, actionRevealedCount - segStart));
              return (
                <span key={i} style={{ color: seg.color }}>
                  {seg.text.slice(0, visible)}
                </span>
              );
            });
          })()
          )}
          {actionRevealedCount < currentActionLength && <span className="space-hud-cursor">▌</span>}
        </div>
      )}

      {!isDesktop && (
        <div className="space-joystick-backdrop">
          <Joystick onMove={handleJoystickMove} onRelease={handleJoystickRelease} />
        </div>
      )}

      {isDesktop && <p className="space-map-hint">WASD to aim into a branch.</p>}
      </div>

      <div className="space-map-controls">
        <button className="btn btn-primary space-map-shuffle" onClick={() => void shufflePlay()}>
          🔀 Shuffle play
        </button>
        <button
          className={`space-map-ambience-toggle ${ambienceEnabled ? "space-map-ambience-toggle-on" : ""}`}
          onClick={() => setAmbienceEnabled(!ambienceEnabled)}
        >
          🌫 Exo-Ambience {ambienceEnabled ? "On" : "Off"}
        </button>
        {isDesktop && (
          <button className="btn space-donate-bottom" onClick={openDonate}>
            💛 Donate
          </button>
        )}
      </div>
      </div>
    </>
  );
}
