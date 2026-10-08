import { PlayGlow } from "./PlayGlow";
import { BranchStudies } from "./BranchStudies";
import { memo, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAudioStore } from "../lib/audioStore";
import { useAuth } from "../lib/auth";
import { identityOf } from "../lib/branchIdentity";
import { cameraTarget, gridLayout, stepToward, TILE_H, TILE_W } from "../lib/branchGrid";
import { makeShuffler } from "../lib/exploreLayout";
import type { BranchPicture, HomeBranch } from "../lib/home";
import { timeAgo } from "../lib/relativeTime";
import type { Branch, PlayableTrackDTO } from "../lib/types";
import { AlbumIcon } from "./ActivityIcons";
import { BranchEmblem } from "./BranchEmblem";
import { ExpandIcon, PauseIcon, PlayIcon, ShuffleIcon } from "./Icons";
import { SpaceMap } from "./SpaceMap";

const CYCLE_MS = 7000;
const prefersReducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;


/** One branch on the grid. Memoised: choosing a branch re-renders the two tiles that changed, not all of them (this matters on a phone). */
const GridTile = memo(function GridTile({ b, x, y, on, onChoose }: { b: HomeBranch; x: number; y: number; on: boolean; onChoose: (slug: string) => void }) {
  const i = identityOf({ slug: b.slug, color: b.color, glyph: b.glyph, seed: b.seed });
  return (
    <button type="button" className={`gtile${on ? " on" : ""}${b.seed ? " seed" : ""}`} style={{ left: x, top: y, width: TILE_W, height: TILE_H, ["--emb" as string]: i.color }} data-slug={b.slug} aria-pressed={on} onClick={() => onChoose(b.slug)} onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) onChoose(b.slug); }}>
      {b.secondaryImage && <img className="gtile-bg" src={b.secondaryImage} alt="" loading="lazy" decoding="async" draggable={false} />}
      <BranchEmblem glyph={i.glyph} color={i.color} size={30} imageUrl={b.image} />
      <span className="gtile-name">{b.name}</span>
      <span className="gtile-meta">{b.tracks} track{b.tracks === 1 ? "" : "s"}</span>
    </button>
  );
});

/**
 * Every branch on a grid bigger than the window that shows it. Choosing a branch (or shuffling) sends the camera travelling to it, fast at first
 * and gentle on arrival, and a card tells you about it. The branch that is playing is followed automatically. The full interactive map opens
 * full screen from the button in the window's corner; nothing heavy loads until then.
 */
export function HomeExplore({ branches, openFull = false, initialSlug = null }: { branches: HomeBranch[]; openFull?: boolean; initialSlug?: string | null }) {
  const { user } = useAuth();
  const play = useAudioStore((s) => s.play);
  const addToQueue = useAudioStore((s) => s.addToQueue);
  const clearQueue = useAudioStore((s) => s.clearQueue);
  const nowSlug = useAudioStore((s) => s.currentTrack?.branchSlug ?? null);
  const isPlayingNow = useAudioStore((s) => s.isPlaying);
  const toggle = useAudioStore((s) => s.toggle);

  const slugKey = branches.map((b) => b.slug).join("|");
  const shuffle = useMemo(() => makeShuffler(branches.map((b) => b.slug)), [slugKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const startOn = initialSlug && branches.some((b) => b.slug === initialSlug) ? initialSlug : null;
  const [selected, setSelected] = useState<string | null>(() => startOn ?? shuffle(null));
  const [touched, setTouched] = useState(!!startOn); // once the person takes over, the map stops moving on by itself
  const [full, setFull] = useState(openFull);
  const [fullBranches, setFullBranches] = useState<Branch[] | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => { if (selected === null || !branches.some((b) => b.slug === selected)) setSelected(shuffle(null)); }, [slugKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const bySlug = useMemo(() => new Map(branches.map((b) => [b.slug, b])), [branches]);
  // When something starts playing, the grid travels to that branch (and stays: the person can shuffle on from there).
  const firstRun = useRef(true);
  useEffect(() => {
    const skip = firstRun.current && !!startOn;
    firstRun.current = false;
    if (skip || !nowSlug || !bySlug.has(nowSlug)) return;
    setTouched(true);
    setSelected(nowSlug);
  }, [nowSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Introduce a new branch every few seconds until the person interacts. Never when they prefer reduced motion or the tab is hidden.
  useEffect(() => {
    if (touched || prefersReducedMotion() || branches.length < 2) return;
    const id = window.setInterval(() => { if (!document.hidden) setSelected((cur) => shuffle(cur)); }, CYCLE_MS);
    return () => window.clearInterval(id);
  }, [touched, shuffle, branches.length]);

  // ---- the grid and its camera
  const grid = useMemo(() => gridLayout(branches.map((b) => b.slug)), [slugKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const tileOf = useMemo(() => new Map(grid.tiles.map((t) => [t.slug, t])), [grid]);
  const winRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<HTMLDivElement>(null);
  const [win, setWin] = useState({ w: 640, h: 300 });
  useEffect(() => {
    const el = winRef.current;
    if (!el) return;
    const measure = () => setWin({ w: el.clientWidth || 640, h: el.clientHeight || 300 });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const target = useMemo(() => { const t = selected ? tileOf.get(selected) : undefined; return t ? cameraTarget(t, win, grid) : { x: 0, y: 0 }; }, [selected, tileOf, win.w, win.h, grid]); // eslint-disable-line react-hooks/exhaustive-deps
  const cam = useRef({ x: 0, y: 0, raf: 0, last: 0, target: { x: 0, y: 0 }, inited: false, sel: null as string | null });
  useLayoutEffect(() => {
    const c = cam.current;
    const apply = () => { if (camRef.current) camRef.current.style.transform = `translate3d(${-c.x}px, ${-c.y}px, 0)`; };
    c.target = target;
    const justResized = c.sel === selected; // same branch, new window size: jump rather than travel
    c.sel = selected;
    if (!c.inited || justResized || prefersReducedMotion()) { c.x = target.x; c.y = target.y; c.inited = true; apply(); return; }
    if (c.raf) return; // already travelling: it picks up the new target on its next frame
    c.last = performance.now();
    const tick = (now: number) => {
      const dt = (now - c.last) / 1000;
      c.last = now;
      c.x = stepToward(c.x, c.target.x, dt);
      c.y = stepToward(c.y, c.target.y, dt);
      apply();
      c.raf = c.x !== c.target.x || c.y !== c.target.y ? requestAnimationFrame(tick) : 0;
    };
    c.raf = requestAnimationFrame(tick);
  }, [target.x, target.y]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (cam.current.raf) cancelAnimationFrame(cam.current.raf); }, []);

  const current = selected ? bySlug.get(selected) ?? null : null;

  // The chosen branch's pictures (its cover, its albums' covers and gallery images), fetched once per branch.
  const picCache = useRef(new Map<string, BranchPicture[]>());
  const [pictures, setPictures] = useState<BranchPicture[] | null>(null);
  useEffect(() => {
    if (!selected) { setPictures(null); return; }
    const cached = picCache.current.get(selected);
    if (cached) { setPictures(cached); return; }
    setPictures(null);
    let alive = true;
    api<BranchPicture[]>(`/api/branches/${selected}/images`).then((p) => { picCache.current.set(selected, p); if (alive) startTransition(() => setPictures(p)); }).catch(() => { if (alive) setPictures([]); });
    return () => { alive = false; };
  }, [selected]);
  const choose = useCallback((slug: string) => { setTouched(true); setSelected(slug); }, []);
  const shuffleNow = useCallback(() => { setTouched(true); setSelected((cur) => shuffle(cur)); }, [shuffle]);

  async function playBranch() {
    if (!current || playing) return;
    if (nowSlug === current.slug) { toggle(); return; } // this branch is already the one loaded: pause / resume it, don't start over
    setTouched(true);
    setPlaying(true);
    try {
      const tracks = await api<PlayableTrackDTO[]>(`/api/branches/${current.slug}/tracks/shuffle`);
      if (tracks.length === 0) return;
      clearQueue();
      const [first, ...rest] = tracks;
      play(first);
      addToQueue(rest);
    } finally {
      setPlaying(false);
    }
  }

  // ---- full screen: the real map, loaded only now
  useEffect(() => {
    if (!full || fullBranches) return;
    let alive = true;
    api<Branch[]>("/api/branches").then((b) => alive && setFullBranches(b)).catch(() => alive && setFullBranches([]));
    return () => { alive = false; };
  }, [full, fullBranches]);
  const enteredBrowserFullscreen = useRef(false);
  const openFullScreen = () => {
    setFull(true);
    setTouched(true);
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => { enteredBrowserFullscreen.current = true; }).catch(() => {}); // best effort: the page-sized view works without it
    }
  };
  const closeFullScreen = useCallback(() => {
    setFull(false);
    if (enteredBrowserFullscreen.current && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    enteredBrowserFullscreen.current = false;
  }, []);
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeFullScreen(); };
    const onFs = () => { if (enteredBrowserFullscreen.current && !document.fullscreenElement) { enteredBrowserFullscreen.current = false; setFull(false); } };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("fullscreenchange", onFs); document.body.style.overflow = prev; };
  }, [full, closeFullScreen]);

  if (branches.length === 0) {
    return (
      <section className="home-section" aria-labelledby="home-explore-h">
        <h2 id="home-explore-h" className="home-h2">Explore the branches</h2>
        <p className="home-dim">The first branches are on their way.</p>
      </section>
    );
  }

  const branchOn = !!current && nowSlug === current.slug && isPlayingNow;
  const idn = current ? identityOf({ slug: current.slug, color: current.color, glyph: current.glyph, seed: current.seed }) : null;
  const bg = current?.secondaryImage ?? null;
  // Pictures that aren't already doing a job (the main image is the logo, the secondary is the background).
  const unused = (pictures ?? []).filter((p) => p.url !== current?.image && p.url !== current?.secondaryImage).slice(0, 9);
  return (
    <section id="home-explore" className="home-section" aria-labelledby="home-explore-h" onPointerDown={() => setTouched(true)} onFocus={() => setTouched(true)}>
      <h2 id="home-explore-h" className="sr-only">Explore the branches</h2>
      <div className="explore-module" data-testid="explore-module" style={{ ["--emb" as string]: idn?.color }}>
        {bg && <img className="explore-bg" key={bg} src={bg} alt="" decoding="async" draggable={false} data-testid="explore-bg" aria-hidden="true" />}
        <div className="explore">
          <div className="gridwin" ref={winRef} data-testid="explore-map" role="group" aria-label="The branches, laid out on a grid">
            <div className="gridcam" ref={camRef} style={{ width: grid.width, height: grid.height }}>
              {grid.tiles.map((t) => <GridTile key={t.slug} b={bySlug.get(t.slug)!} x={t.x} y={t.y} on={t.slug === selected} onChoose={choose} />)}
            </div>
            <button type="button" className="btn gridwin-full" onClick={openFullScreen} data-testid="explore-full"><ExpandIcon size={14} /> Full screen</button>
          </div>
          {current && idn && (
            <article className="explore-card" data-testid="explore-card" aria-live="off">
              <Link className="explore-head" to={`/soundbay?open=${current.slug}`} data-testid="explore-head" title={`Open ${current.name} in Soundbay`}>
                <BranchEmblem glyph={idn.glyph} color={idn.color} size={56} imageUrl={current.image} />
                <h3 className="explore-name">{current.name}</h3>
              </Link>
              <div className="explore-chips">
                {current.seed && <span className="home-chip">Growing seed</span>}
                {nowSlug === current.slug && <span className="home-chip home-chip-live" data-testid="explore-playing">Playing now</span>}
              </div>
              <p className="explore-blurb">{current.blurb || "No description yet."}</p>
              <p className="home-dim explore-meta">
                {current.albums} album{current.albums === 1 ? "" : "s"} · {current.tracks} track{current.tracks === 1 ? "" : "s"}
                {current.lastActiveAt ? ` · active ${timeAgo(current.lastActiveAt)}` : ""}
              </p>
              <div className="explore-actions">
                <button type="button" className="btn icon-btn" onClick={shuffleNow} aria-label="Pick another branch at random" title="Shuffle branches" data-testid="explore-shuffle"><ShuffleIcon size={18} /></button>
                <PlayGlow><button type="button" className="btn btn-primary icon-btn" onClick={playBranch} disabled={playing} aria-label={branchOn ? `Pause ${current.name}` : `Play a shuffle of ${current.name}`} title={branchOn ? "Pause" : `Play a shuffle of ${current.name}`} data-testid="explore-play">{branchOn ? <PauseIcon size={18} /> : <PlayIcon size={18} />}</button></PlayGlow>
              </div>
            </article>
          )}
        </div>
        {current && unused.length > 0 && (
          <ul className="explore-pics" aria-label={`More pictures from ${current.name}`} data-testid="explore-pics">
            {unused.map((p) => (
              <li key={p.url} data-kind={p.kind}>
                <Link to={p.albumSlug ? `/album/${p.albumSlug}` : `/soundbay?open=${current.slug}`} title={p.label} aria-label={p.albumSlug ? `${p.label} (album)` : p.label}>
                  <img src={p.url} alt="" loading="lazy" decoding="async" />
                  {p.kind === "album-cover" && <span className="pic-album-icon" data-testid="pic-album-icon"><AlbumIcon size={15} /></span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {current && <BranchStudies studies={current.studies ?? []} />}
      </div>

      {full && (
        <div className="explore-full" role="dialog" aria-modal="true" aria-label="Branch map" data-testid="explore-full-overlay">
          <button type="button" className="btn explore-full-close" onClick={closeFullScreen} data-testid="explore-full-close">Close map</button>
          {fullBranches ? (
            <div className="homepage-fill" style={{ height: "100dvh" }}>
              <SpaceMap branches={fullBranches} centerLabel={user ? "Log" : "Join"} centerHref={user ? "/wiki" : "/join"} />
            </div>
          ) : (
            <p className="home-dim" style={{ padding: "2rem" }}>Loading the map…</p>
          )}
        </div>
      )}
    </section>
  );
}
