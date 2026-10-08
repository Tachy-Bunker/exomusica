import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { stepToward } from "../lib/branchGrid";
import { DEFAULT_OPACITY, IDLE_MS, RESUME_MS, cardLook, clampCamera, settleIndex, shouldAutoplay, stepIndex, type FeaturedItem } from "../lib/featured";
import { NewsIcon, StudyIcon, WikiIcon } from "./ActivityIcons";

const KIND: Record<FeaturedItem["kind"], { label: string; Icon: typeof StudyIcon }> = {
  study: { label: "Study", Icon: StudyIcon },
  news: { label: "News", Icon: NewsIcon },
  wiki: { label: "Wiki", Icon: WikiIcon },
};
const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const GAP = 14; // px between cards (also in the CSS)

/**
 * Featured articles, under the branch explorer. The top row shows the chosen article (its picture behind, its preview text); the row below is
 * an ensemble of all of them that you can drag, flick or click through. Everything glides with the same exponential approach as the branch
 * explorer's camera. When nobody is using it, it moves on to the next article by itself every few seconds; a person using it pauses that for a while.
 */
export function FeaturedArticles() {
  const [items, setItems] = useState<FeaturedItem[] | null>(null);
  useEffect(() => {
    let alive = true;
    api<FeaturedItem[]>("/api/featured").then((l) => alive && setItems(l)).catch(() => alive && setItems([]));
    return () => { alive = false; };
  }, []);
  if (!items || items.length === 0) return null;
  return <Slideshow items={items} />;
}

function Slideshow({ items }: { items: FeaturedItem[] }) {
  const navigate = useNavigate();
  const n = items.length;
  const [sel, setSel] = useState(0);
  const [prev, setPrev] = useState<number | null>(null); // the slide fading out
  const [inView, setInView] = useState(true);
  const [hovering, setHovering] = useState(false);
  const [auto, setAuto] = useState(false);
  const [bump, setBump] = useState(0);
  const lastTouch = useRef(-1e9);
  const resumeTimer = useRef<number | undefined>(undefined);
  const rootRef = useRef<HTMLElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const cam = useRef({ x: 0, target: 0, raf: 0, last: 0, pitch: 200, dragging: false, moved: false, startX: 0, startCam: 0, vel: 0, lastX: 0, lastT: 0 });

  // ---- choosing a slide (by hand, by drag, or by the idle timer)
  const selRef = useRef(0);
  const choose = useCallback((i: number) => {
    if (i === selRef.current) return;
    setPrev(selRef.current);
    selRef.current = i;
    setSel(i);
  }, []);
  useEffect(() => { if (prev === null) return; const id = window.setTimeout(() => setPrev(null), 800); return () => window.clearTimeout(id); }, [prev]);
  const touched = useCallback(() => {
    lastTouch.current = performance.now();
    window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setBump((b) => b + 1), RESUME_MS + 50);
    setBump((b) => b + 1); // cancels the timer that was about to move on
  }, []);
  useEffect(() => () => window.clearTimeout(resumeTimer.current), []);

  // ---- idle mode: move on by itself, but not off-screen, in a hidden tab, under the pointer, or right after someone used it
  useEffect(() => {
    const ok = shouldAutoplay({ count: n, reducedMotion: reduced(), hidden: document.hidden, inView, sinceTouchMs: performance.now() - lastTouch.current, hovering });
    setAuto(ok);
    if (!ok) return;
    const id = window.setTimeout(() => choose(stepIndex(sel, n)), IDLE_MS);
    return () => window.clearTimeout(id);
  }, [sel, n, inView, hovering, bump, choose]);
  useEffect(() => {
    const on = () => setBump((b) => b + 1);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // ---- the row: one camera, moved by exponential approach; each card's size and fade follow its distance from the middle
  const paint = useCallback(() => {
    const c = cam.current;
    if (trackRef.current) trackRef.current.style.transform = `translate3d(${-c.x}px,0,0)`;
    cardRefs.current.forEach((el, i) => {
      if (!el) return;
      const look = cardLook((i * c.pitch - c.x) / c.pitch);
      el.style.transform = `scale(${look.scale.toFixed(3)})`;
      el.style.opacity = look.opacity.toFixed(3);
    });
  }, []);
  const run = useCallback(() => {
    const c = cam.current;
    if (c.raf || c.dragging) return;
    c.last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - c.last) / 1000);
      c.last = now;
      c.x = stepToward(c.x, c.target, dt, 7);
      paint();
      c.raf = c.dragging || c.x === c.target ? 0 : requestAnimationFrame(tick);
    };
    c.raf = requestAnimationFrame(tick);
  }, [paint]);
  const measure = useCallback(() => {
    const first = cardRefs.current[0];
    if (!first) return;
    cam.current.pitch = first.offsetWidth + GAP;
    cam.current.x = cam.current.target = sel * cam.current.pitch; // a new size: jump rather than travel
    paint();
  }, [sel, paint]);
  useLayoutEffect(() => { measure(); }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = stripRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);
  useEffect(() => { // a new slide: the camera travels to its card
    const c = cam.current;
    c.target = sel * c.pitch;
    if (reduced()) { c.x = c.target; paint(); } else run();
  }, [sel, run, paint]);
  useEffect(() => () => { if (cam.current.raf) cancelAnimationFrame(cam.current.raf); }, []);

  // ---- hands: drag or flick the row (a short press is a click on a card)
  function down(e: React.PointerEvent) {
    const c = cam.current;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    c.dragging = false; c.moved = false; c.startX = e.clientX; c.startCam = c.x; c.vel = 0; c.lastX = e.clientX; c.lastT = performance.now();
    (e.currentTarget as HTMLElement).dataset.down = "1";
  }
  function move(e: React.PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    const c = cam.current;
    if (el.dataset.down !== "1") return;
    const dx = e.clientX - c.startX;
    if (!c.moved && Math.abs(dx) > 6) { c.moved = true; c.dragging = true; if (c.raf) { cancelAnimationFrame(c.raf); c.raf = 0; } try { el.setPointerCapture(e.pointerId); } catch { /* fine without capture */ } touched(); }
    if (!c.moved) return;
    const t = performance.now();
    const v = ((c.lastX - e.clientX) / Math.max(1, t - c.lastT)) * 1000; // camera px/s (the camera moves against the pointer)
    c.vel = c.vel * 0.6 + v * 0.4;
    c.lastX = e.clientX; c.lastT = t;
    c.x = clampCamera(c.startCam - dx, c.pitch, n);
    paint();
  }
  function up(e: React.PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    const c = cam.current;
    delete el.dataset.down;
    if (!c.moved) return;
    c.dragging = false;
    try { el.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    const idx = settleIndex(c.x, c.vel, c.pitch, n);
    if (idx !== sel) choose(idx); else { c.target = sel * c.pitch; run(); }
    window.setTimeout(() => { c.moved = false; }, 0); // the click that ends a drag is not a choice
  }
  function cardClick(i: number) {
    if (cam.current.moved) return;
    touched();
    if (i === sel) navigate(items[i].href); else choose(i);
  }
  function key(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") { e.preventDefault(); touched(); choose(stepIndex(sel, n, 1)); cardRefs.current[stepIndex(sel, n, 1)]?.focus(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); touched(); choose(stepIndex(sel, n, -1)); cardRefs.current[stepIndex(sel, n, -1)]?.focus(); }
  }

  const cur = items[sel];
  const old = prev !== null ? items[prev] : null;
  const layer = (it: FeaturedItem, kind: "in" | "out") => it.imageUrl && (
    <img key={`${kind}-${it.id}`} className={`feat-bg feat-bg-${kind}`} src={it.imageUrl} alt="" decoding="async" draggable={false} style={{ ["--bgo" as string]: it.imageOpacity ?? DEFAULT_OPACITY }} />
  );
  const { label, Icon } = KIND[cur.kind];

  return (
    <section ref={rootRef} className="home-section feat" aria-roledescription="carousel" aria-labelledby="feat-h" data-testid="featured" onPointerEnter={(e) => { if (e.pointerType === "mouse") setHovering(true); }} onPointerLeave={() => setHovering(false)} onFocus={() => touched()}>
      <h2 id="feat-h" className="sr-only">Featured articles</h2>
      <div className="feat-stage" aria-live="off">
        {old && layer(old, "out")}
        {layer(cur, "in")}
        <div className="feat-stage-top">
          <span className="feat-label">Featured articles</span>
          <span className="feat-count" aria-label={`${sel + 1} of ${n}`}>{sel + 1} / {n}</span>
        </div>
        <div className="feat-body" key={cur.id}>
          <span className="home-chip feat-kind"><Icon size={14} /> {label}</span>
          <h3 className="feat-title"><Link to={cur.href} data-testid="featured-link">{cur.title}</Link></h3>
          {cur.text && <p className="feat-text">{cur.text}</p>}
          <p className="feat-meta">{cur.by && <span className="home-dim">by {cur.by}</span>}<Link className="feat-read" to={cur.href}>Read</Link></p>
        </div>
        <span className={`feat-progress${auto ? " on" : ""}`} aria-hidden="true"><i key={`${sel}-${bump}`} style={{ animationDuration: `${IDLE_MS}ms` }} /></span>
      </div>

      <div className="feat-strip" ref={stripRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key} role="group" aria-label="All featured articles" data-testid="featured-strip">
        <div className="feat-track" ref={trackRef}>
          {items.map((it, i) => {
            const K = KIND[it.kind];
            return (
              <button key={it.id} type="button" ref={(el) => { cardRefs.current[i] = el; }} className={`feat-card${i === sel ? " on" : ""}`} aria-current={i === sel ? "true" : undefined} aria-label={`${it.title} (${K.label})${i === sel ? ": open" : ""}`} onClick={() => cardClick(i)} data-testid="featured-card" style={{ ["--d" as string]: `${-((i * 1.7) % 5).toFixed(2)}s` }}>
                <span className="feat-card-in">
                  {it.imageUrl && <img src={it.imageUrl} alt="" loading="lazy" decoding="async" draggable={false} />}
                  <span className="feat-card-text"><K.Icon size={13} /><b>{it.title}</b></span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
