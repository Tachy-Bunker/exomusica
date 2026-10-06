import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAudioStore } from "../lib/audioStore";
import { useAuth } from "../lib/auth";
import { layoutBranches, makeShuffler, VIEW_H, VIEW_W } from "../lib/exploreLayout";
import type { HomeBranch } from "../lib/home";
import { timeAgo } from "../lib/relativeTime";
import type { Branch, PlayableTrackDTO } from "../lib/types";
import { SpaceMap } from "./SpaceMap";

const CYCLE_MS = 7000;
const MAX_DRIFTING = 40; // a very large map keeps still: nothing animates that the device doesn't need to

const prefersReducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * A small, calm map of the branches. It drifts gently, introduces one branch at a time (shuffle or tap), and shows a short card about it.
 * The full interactive map opens full screen from the button. Nothing heavy loads until that button is pressed.
 */
export function HomeExplore({ branches, openFull = false }: { branches: HomeBranch[]; openFull?: boolean }) {
  const { user } = useAuth();
  const play = useAudioStore((s) => s.play);
  const addToQueue = useAudioStore((s) => s.addToQueue);
  const clearQueue = useAudioStore((s) => s.clearQueue);

  const slugKey = branches.map((b) => b.slug).join("|");
  const shuffle = useMemo(() => makeShuffler(branches.map((b) => b.slug)), [slugKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selected, setSelected] = useState<string | null>(() => shuffle(null));
  const [touched, setTouched] = useState(false); // once the person takes over, the map stops introducing branches by itself
  const [full, setFull] = useState(openFull);
  const [fullBranches, setFullBranches] = useState<Branch[] | null>(null);
  const [playing, setPlaying] = useState(false);
  const wrapRef = useRef<HTMLElement>(null);

  useEffect(() => { if (selected === null || !branches.some((b) => b.slug === selected)) setSelected(shuffle(null)); }, [slugKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Introduce a new branch every few seconds until the person interacts. Never when they prefer reduced motion or the tab is hidden.
  useEffect(() => {
    if (touched || prefersReducedMotion() || branches.length < 2) return;
    const id = window.setInterval(() => { if (!document.hidden) setSelected((cur) => shuffle(cur)); }, CYCLE_MS);
    return () => window.clearInterval(id);
  }, [touched, shuffle, branches.length]);

  const { nodes, edges } = useMemo(() => layoutBranches(branches), [branches]);
  const bySlug = useMemo(() => new Map(branches.map((b) => [b.slug, b])), [branches]);
  const nodeBySlug = useMemo(() => new Map(nodes.map((n) => [n.slug, n])), [nodes]);
  const current = selected ? bySlug.get(selected) ?? null : null;
  const drifting = nodes.length <= MAX_DRIFTING;

  const choose = useCallback((slug: string) => { setTouched(true); setSelected(slug); }, []);
  const shuffleNow = useCallback(() => { setTouched(true); setSelected((cur) => shuffle(cur)); }, [shuffle]);

  async function playBranch() {
    if (!current || playing) return;
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

  return (
    <section className="home-section" aria-labelledby="home-explore-h" ref={wrapRef} onPointerDown={() => setTouched(true)} onFocus={() => setTouched(true)}>
      <div className="home-h2-row">
        <h2 id="home-explore-h" className="home-h2">Explore the branches</h2>
        <span className="home-h2-actions">
          <button type="button" className="btn" onClick={shuffleNow} data-testid="explore-shuffle">Shuffle</button>
          <button type="button" className="btn" onClick={openFullScreen} data-testid="explore-full">Full screen</button>
        </span>
      </div>
      <div className="explore">
        <svg className="explore-map" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="group" aria-label="Map of the branches" data-testid="explore-map">
          {edges.map((e) => {
            const a = nodeBySlug.get(e.from)!, b = nodeBySlug.get(e.to)!;
            return <line key={e.from + e.to} className="explore-edge" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
          {nodes.map((n, i) => {
            const b = bySlug.get(n.slug)!;
            const on = n.slug === selected;
            return (
              <g
                key={n.slug}
                className={`explore-node${on ? " on" : ""}${b.seed ? " seed" : ""}${drifting ? " drift" : ""}`}
                style={drifting ? { animationDelay: `${-(i * 1.7) % 9}s`, animationDuration: `${8 + (i % 5)}s` } : undefined}
                role="button"
                tabIndex={0}
                aria-label={b.name}
                aria-pressed={on}
                data-slug={n.slug}
                onClick={() => choose(n.slug)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(n.slug); } }}
              >
                {on && <circle className="explore-halo" cx={n.x} cy={n.y} r={n.r + 2.4} />}
                <circle className="explore-dot" cx={n.x} cy={n.y} r={n.r} />
                <circle className="explore-hit" cx={n.x} cy={n.y} r={Math.max(n.r + 2, 4)} />
                {on && <text className="explore-label" x={n.x} y={n.y - n.r - 3.2} textAnchor="middle">{b.name}</text>}
              </g>
            );
          })}
        </svg>
        {current && (
          <article className="explore-card" data-testid="explore-card" aria-live="off">
            {current.coverArtUrl && <img className="explore-cover" src={current.coverArtUrl} alt="" loading="lazy" width={72} height={72} />}
            <div className="explore-card-body">
              <h3 className="explore-name">{current.name}</h3>
              {current.seed && <span className="home-chip">Growing seed</span>}
              <p className="explore-blurb">{current.blurb || "No description yet."}</p>
              <p className="home-dim explore-meta">
                {current.albums} album{current.albums === 1 ? "" : "s"}
                {current.lastActiveAt ? ` · active ${timeAgo(current.lastActiveAt)}` : ""}
              </p>
              <div className="explore-actions">
                <button type="button" className="btn btn-primary" onClick={playBranch} disabled={playing} data-testid="explore-play">{playing ? "Loading…" : "Play shuffle"}</button>
                <Link className="btn" to={`/branch/${current.slug}`} data-testid="explore-open">Open branch</Link>
              </div>
            </div>
          </article>
        )}
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
