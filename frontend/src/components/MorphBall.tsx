import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAudioStore } from "../lib/audioStore";
import { ScaleGovernor } from "../lib/roomPerf";
import { ballOutline, brightAt, heightAt, hueOf, markCrossed, marksOf, nextMark, prevMark, scrubRate, type Mark, type Profile } from "../lib/waveBall";
import { loadProfile } from "../lib/waveLoad";
import type { PlayableTrackDTO } from "../lib/types";

const VIEW_MAX = 28, BALL_AT = 0.32, SEEK_EVERY = 100, FLASH_MS = 1800, NP = 24, TRAIL = 22;
// colour tables (built once): one fill and one ridge colour per brightness step
const STEPS = 40, FILL: string[] = [], RIDGE: string[] = [], DEEP: string[] = [];
for (let i = 0; i < STEPS; i++) { const h = Math.round(hueOf(i / (STEPS - 1))); FILL.push(`hsl(${h} 62% 30%)`); RIDGE.push(`hsl(${h} 85% 66%)`); DEEP.push(`hsl(${h} 55% 14%)`); }

/** Roll a ball along the track you are listening to. The ground is its loudness, the colour its brightness, the pylons are its save points, and where the ball is, is where the music is. */
/** How many seconds the screen holds: 28 for a normal track, less for a very short one so it still fills the view. */
const viewOf = (d: number): number => Math.max(6, Math.min(VIEW_MAX, d / 2));
export function MorphBall({ track, onClose }: { track: PlayableTrackDTO; onClose: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null), stage = useRef<HTMLDivElement>(null);
  const prof = useRef<Profile | null>(null), marks = useRef<Mark[]>([]), dur = useRef(Math.max(1, track.durationSeconds ?? 1));
  const [phase, setPhase] = useState<string>("Finding the track…"), [err, setErr] = useState(""), [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<string>("");
  const dir = useRef<-1 | 0 | 1>(0), held = useRef(0), tgt = useRef(0), shown = useRef(0), lastSeek = useRef(0), scrubUntil = useRef(0);
  const base = useRef({ t: 0, at: 0 }), playing = useRef(false), flash = useRef({ label: "", at: -1e9 });
  const gov = useRef(new ScaleGovernor()), size = useRef({ w: 0, h: 0 }), dirty = useRef(true), raf = useRef(0);
  const sim = useRef({ y: 0, vy: 0, spin: 0, last: 0, trail: new Float64Array(TRAIL * 2), ti: 0, tAt: 0 });
  const outline = useRef(new Float64Array(NP)), drag = useRef<{ x: number; t: number } | null>(null);
  const wake = useRef(() => {});

  // ---- the profile
  useEffect(() => {
    let dead = false; prof.current = null; setReady(false); setErr(""); setPhase("Finding the track…");
    const names = { fetch: "Finding the track…", decode: "Listening to the whole track…", measure: "Measuring it…" } as const;
    loadProfile(track, (s) => { if (!dead) setPhase(names[s]); }).then((p) => { if (dead) return; prof.current = p; setReady(true); dirty.current = true; wake.current(); }, () => { if (!dead) setErr("This track could not be read here (the file may not allow it)."); });
    return () => { dead = true; };
  }, [track.id, track.source, track.fileUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- follow the player
  useEffect(() => {
    const take = (s: ReturnType<typeof useAudioStore.getState>) => {
      if (s.duration > 0) dur.current = s.duration;
      marks.current = marksOf(s.currentTrack?.bookmarks ?? track.bookmarks, dur.current); playing.current = s.isPlaying;
      if (performance.now() > scrubUntil.current) base.current = { t: s.currentTime, at: performance.now() };
      dirty.current = true; wake.current();
    };
    take(useAudioStore.getState()); shown.current = tgt.current = base.current.t;
    return useAudioStore.subscribe(take);
  }, [track.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const seekTo = useCallback((t: number, now: number) => { const d = dur.current, c = Math.max(0, Math.min(d - 0.05, t)); useAudioStore.getState().seek(c); lastSeek.current = now; base.current = { t: c, at: now }; }, []);
  const jump = useCallback((m: Mark | null) => { if (!m) return; const now = performance.now(); scrubUntil.current = now + 250; tgt.current = m.t; seekTo(m.t, now); dirty.current = true; wake.current(); }, [seekTo]);

  // ---- keys
  useEffect(() => {
    const set = (d: -1 | 1, on: boolean) => { if (on) { if (dir.current !== d) { dir.current = d; held.current = 0; } } else if (dir.current === d) { dir.current = 0; seekTo(tgt.current, performance.now()); scrubUntil.current = performance.now() + 250; } wake.current(); };
    const kd = (e: KeyboardEvent) => {
      const c = e.code; if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (c === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
      if (c === "ArrowLeft" || c === "KeyA") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) set(-1, true); }
      else if (c === "ArrowRight" || c === "KeyD") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) set(1, true); }
      else if (c === "KeyQ") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) jump(prevMark(marks.current, tgt.current)); }
      else if (c === "KeyE") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) jump(nextMark(marks.current, tgt.current)); }
      else if (c === "Space") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) useAudioStore.getState().toggle(); }
    };
    const ku = (e: KeyboardEvent) => { if (e.code === "ArrowLeft" || e.code === "KeyA") set(-1, false); else if (e.code === "ArrowRight" || e.code === "KeyD") set(1, false); };
    window.addEventListener("keydown", kd, true); window.addEventListener("keyup", ku, true);
    return () => { window.removeEventListener("keydown", kd, true); window.removeEventListener("keyup", ku, true); };
  }, [onClose, seekTo, jump]);

  // ---- the loop
  useEffect(() => {
    const c = cv.current, st = stage.current; if (!c || !st) return;
    const fit = () => {
      const r = st.getBoundingClientRect(), s = gov.current.scale * Math.min(window.devicePixelRatio || 1, 1.5);
      size.current = { w: r.width, h: r.height }; c.width = Math.max(2, Math.round(r.width * s)); c.height = Math.max(2, Math.round(r.height * s)); dirty.current = true;
    };
    fit(); const ro = new ResizeObserver(fit); ro.observe(st);
    let lastPaint = 0, ds = 0;
    const frame = (now: number) => {
      raf.current = 0; if (document.hidden) return;
      const s = sim.current, dt = s.last ? Math.min(0.1, (now - s.last) / 1000) : 0.016; s.last = now;
      const d = dur.current, p = prof.current;
      // where the head is: scrubbing moves it, otherwise it rides the player
      let t: number;
      if (dir.current !== 0) {
        held.current += dt; tgt.current = Math.max(0, Math.min(d - 0.05, tgt.current + scrubRate(dir.current, held.current) * dt)); t = tgt.current;
        if (now - lastSeek.current >= SEEK_EVERY) seekTo(tgt.current, now);
        scrubUntil.current = now + 400;
      } else if (drag.current) t = tgt.current;
      else { const b = base.current; t = Math.min(d, b.t + (playing.current ? (now - b.at) / 1000 : 0)); tgt.current = t; }
      const prev = shown.current; shown.current = t;
      const mk = markCrossed(marks.current, prev, t); if (mk && mk.label !== flash.current.label || (mk && now - flash.current.at > FLASH_MS)) { flash.current = { label: mk.label, at: now }; setSaved(mk.label); }
      const moving = Math.abs(t - prev) > 1e-4 || dir.current !== 0 || !!drag.current;
      const anim = moving || now - flash.current.at < FLASH_MS || Math.abs(s.vy) > 0.5 || !ready;
      if (anim || dirty.current) {
        if (!gov.current.minGap || now - lastPaint >= gov.current.minGap) {
          lastPaint = now; dirty.current = false; const t0 = performance.now(); paint(c, t, d, p, now, dt, moving);
          if (gov.current.observe(performance.now() - t0, now) !== null) fit();
          if (now - ds > 100) { ds = now; st.dataset.t = t.toFixed(2); st.dataset.dir = String(dir.current); st.dataset.drawn = String((Number(st.dataset.drawn) || 0) + 1); st.dataset.scale = String(gov.current.scale); }
        } else dirty.current = true;
      }
      if (anim || dirty.current || dir.current !== 0) raf.current = requestAnimationFrame(frame); else { st.dataset.t = t.toFixed(2); st.dataset.dir = "0"; s.last = 0; }
    };
    wake.current = () => { if (!raf.current && !document.hidden) raf.current = requestAnimationFrame(frame); };
    const vis = () => { if (!document.hidden) { sim.current.last = 0; dirty.current = true; wake.current(); } }; document.addEventListener("visibilitychange", vis);
    wake.current();
    return () => { ro.disconnect(); document.removeEventListener("visibilitychange", vis); cancelAnimationFrame(raf.current); raf.current = 0; wake.current = () => {}; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const paint = (c: HTMLCanvasElement, t: number, d: number, p: Profile | null, now: number, dt: number, moving: boolean) => {
    const ctx = c.getContext("2d"); if (!ctx) return; const { w, h } = size.current; if (!w || !h) return;
    const k = c.width / w; ctx.setTransform(k, 0, 0, k, 0, 0);
    const base = h * 0.8, hMax = h * 0.46, R = Math.max(11, Math.min(20, h * 0.03)), bx = w * BALL_AT, pps = w / viewOf(d), ovH = 34, ovY = h - ovH - 10;
    const hue = p ? hueOf(brightAt(p, t, d)) : 262, bright = p ? brightAt(p, t, d) : 0;
    ctx.fillStyle = "#07060d"; ctx.fillRect(0, 0, w, h);
    // a haze in the colour of the sound under the ball
    ctx.fillStyle = `hsla(${hue}, 70%, 40%, 0.10)`; ctx.fillRect(0, h * 0.35, w, h * 0.65);
    ctx.fillStyle = `hsla(${hue}, 80%, 55%, 0.07)`; ctx.fillRect(0, h * 0.58, w, h * 0.42);
    if (!p) { ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(0, base, w, 3); return; }
    // the ground: one slice per bin in view, filled in its own colour, with a light ridge on top
    const n = p.amp.length, per = d / n, i0 = Math.max(0, Math.floor((t - bx / pps) / per) - 1), i1 = Math.min(n - 1, Math.ceil((t + (w - bx) / pps) / per) + 1);
    let px = bx + ((i0 + 0.5) * per - t) * pps, py = base - (p.amp[i0] / 255) * hMax;
    for (let i = i0 + 1; i <= i1; i++) {
      const x = bx + ((i + 0.5) * per - t) * pps, y = base - (p.amp[i] / 255) * hMax, b = Math.round((p.cen[i] / 255) * (STEPS - 1));
      ctx.fillStyle = FILL[b]; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.lineTo(x, h); ctx.lineTo(px, h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = RIDGE[b]; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.lineTo(x, y + 4); ctx.lineTo(px, py + 4); ctx.closePath(); ctx.fill();
      px = x; py = y;
    }
    // save points
    ctx.font = "600 12px system-ui, sans-serif"; ctx.textAlign = "center";
    for (const m of marks.current) {
      const x = bx + (m.t - t) * pps; if (x < -40 || x > w + 40) continue;
      const y = base - heightAt(p, m.t, d) * hMax, top = y - 54, near = Math.abs(m.t - t) < 3.5, pulse = 0.5 + 0.5 * Math.sin(now / 260);
      ctx.fillStyle = `hsla(${hueOf(brightAt(p, m.t, d))}, 90%, 75%, ${near ? 0.9 : 0.55})`; ctx.fillRect(x - 1, top, 2, y - top);
      ctx.beginPath(); ctx.moveTo(x, top - 9); ctx.lineTo(x + 7, top); ctx.lineTo(x, top + 9); ctx.lineTo(x - 7, top); ctx.closePath(); ctx.fill();
      if (near) { ctx.fillStyle = `hsla(${hue}, 90%, 80%, ${0.12 + 0.12 * pulse})`; ctx.beginPath(); ctx.arc(x, top, 15 + 4 * pulse, 0, 6.2832); ctx.fill(); ctx.fillStyle = "#f4f0ff"; ctx.fillText(m.label, x, top - 16); }
    }
    // the ball: sits on the ground at the playhead; a little spring so steep drops are felt
    const surf = base - heightAt(p, t, d) * hMax - R * 0.85, sm = sim.current;
    if (!sm.y) sm.y = surf;
    sm.vy += (surf - sm.y) * 140 * dt; sm.vy *= Math.exp(-dt * 14); sm.y += sm.vy * dt; if (sm.y > surf + R * 0.4) { sm.y = surf + R * 0.4; sm.vy = 0; }
    sm.spin += ((t - sm.tAt) * pps) / R; sm.tAt = t; // rolls by exactly the ground it covers
    if (moving && now - lastTrail.current > 40) { lastTrail.current = now; sm.trail[sm.ti * 2] = t; sm.trail[sm.ti * 2 + 1] = sm.y; sm.ti = (sm.ti + 1) % TRAIL; }
    for (let i = 0; i < TRAIL; i++) { const tt = sm.trail[i * 2]; if (!tt) continue; const x = bx + (tt - t) * pps; if (x < -10 || x > w) continue; const a = Math.max(0, 1 - Math.abs(x - bx) / (w * 0.22)) * 0.35; if (a > 0.02) { ctx.fillStyle = `hsla(${hue}, 85%, 65%, ${a})`; ctx.beginPath(); ctx.arc(x, sm.trail[i * 2 + 1], R * 0.32, 0, 6.2832); ctx.fill(); } }
    ballOutline(bright, sm.spin, NP, outline.current);
    const fl = Math.max(0, 1 - (now - flash.current.at) / 700);
    ctx.fillStyle = `hsla(${hue}, 90%, 60%, ${0.16 + 0.3 * fl})`; ctx.beginPath(); ctx.arc(bx, sm.y, R * (1.9 + fl), 0, 6.2832); ctx.fill();
    ctx.fillStyle = `hsl(${hue}, 85%, ${58 + bright * 14}%)`; ctx.beginPath();
    for (let i = 0; i < NP; i++) { const a = (i / NP) * 6.2832 + sm.spin, r = R * outline.current[i]; const x = bx + Math.cos(a) * r, y = sm.y + Math.sin(a) * r; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.beginPath(); ctx.arc(bx - R * 0.3, sm.y - R * 0.3, R * 0.22, 0, 6.2832); ctx.fill();
    // the whole track, small, at the bottom: tap to go there
    ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fillRect(10, ovY, w - 20, ovH);
    const ow = w - 20, step = Math.max(1, Math.floor(n / ow));
    for (let i = 0; i < n; i += step) { const b = Math.round((p.cen[i] / 255) * (STEPS - 1)), hh = Math.max(1, (p.amp[i] / 255) * ovH); ctx.fillStyle = FILL[b]; ctx.fillRect(10 + (i / n) * ow, ovY + ovH - hh, Math.max(1, (step / n) * ow), hh); }
    for (const m of marks.current) { ctx.fillStyle = "#f4f0ff"; ctx.fillRect(10 + (m.t / d) * ow - 1, ovY - 4, 2, ovH + 4); }
    ctx.fillStyle = "#fff"; ctx.fillRect(10 + (t / d) * ow - 1, ovY - 6, 2, ovH + 6);
  };
  const lastTrail = useRef(0);

  // ---- touch / mouse: drag the ground to roll, tap a pylon or the strip to go there
  const onDown = (e: React.PointerEvent) => {
    const r = stage.current!.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, { w, h } = size.current;
    if (y > h - 34 - 20) { const f = Math.max(0, Math.min(1, (x - 10) / (w - 20))); jump({ label: "", t: f * dur.current }); return; }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, t: tgt.current };
  };
  const onMove = (e: React.PointerEvent) => {
    const g = drag.current; if (!g) return; const pps = size.current.w / viewOf(dur.current), now = performance.now();
    tgt.current = Math.max(0, Math.min(dur.current - 0.05, g.t - (e.clientX - g.x) / pps)); scrubUntil.current = now + 400;
    if (now - lastSeek.current >= SEEK_EVERY) seekTo(tgt.current, now);
    dirty.current = true; wake.current();
  };
  const onUp = (e: React.PointerEvent) => {
    const g = drag.current; drag.current = null; if (!g) return;
    if (Math.abs(e.clientX - g.x) < 6) { // a tap: on a pylon, go to it
      const r = stage.current!.getBoundingClientRect(), pps = size.current.w / viewOf(dur.current), bx = size.current.w * BALL_AT, x = e.clientX - r.left;
      const near = marks.current.find((m) => Math.abs(bx + (m.t - tgt.current) * pps - x) < 22); if (near) { jump(near); return; }
    }
    scrubUntil.current = performance.now() + 250; seekTo(tgt.current, performance.now()); wake.current();
  };
  const hold = (d: -1 | 1) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); dir.current = d; held.current = 0; wake.current(); },
    onPointerUp: () => { if (dir.current === d) { dir.current = 0; seekTo(tgt.current, performance.now()); scrubUntil.current = performance.now() + 250; wake.current(); } },
    onPointerCancel: () => { if (dir.current === d) dir.current = 0; },
  });
  useEffect(() => { if (!saved) return; const id = window.setTimeout(() => setSaved(""), FLASH_MS); return () => window.clearTimeout(id); }, [saved]);

  const isPlaying = useAudioStore((s) => s.isPlaying), toggle = useAudioStore((s) => s.toggle);
  return createPortal(
    <div className="mb-overlay" role="dialog" aria-label="Morph ball" data-testid="morph-ball">
      <div className="mb-top">
        <div className="mb-title"><strong>{track.title}</strong><span>{track.albumTitle}</span></div>
        <button type="button" className="btn" onClick={onClose} data-testid="morph-close" aria-label="Close">✕</button>
      </div>
      <div className="mb-stage" ref={stage} data-testid="morph-stage" data-ready={ready ? "1" : ""} data-marks={marks.current.length} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { drag.current = null; }}>
        <canvas ref={cv} aria-hidden="true" />
        {!ready && <div className="mb-wait" data-testid="morph-wait" role={err ? "alert" : "status"}>{err || phase}</div>}
        {saved && <div className="mb-saved" data-testid="morph-saved">◆ {saved}</div>}
      </div>
      <div className="mb-bar">
        <button type="button" className="btn" data-testid="morph-prev" onClick={() => jump(prevMark(marks.current, tgt.current))} title="Previous save point (Q)">◆◀</button>
        <button type="button" className="btn mb-hold" data-testid="morph-left" aria-label="Roll back (A / ←)" {...hold(-1)}>◀</button>
        <button type="button" className="btn btn-primary" data-testid="morph-play" onClick={toggle} aria-label={isPlaying ? "Pause" : "Play"}>{isPlaying ? "❚❚" : "▶"}</button>
        <button type="button" className="btn mb-hold" data-testid="morph-right" aria-label="Roll forward (D / →)" {...hold(1)}>▶</button>
        <button type="button" className="btn" data-testid="morph-next" onClick={() => jump(nextMark(marks.current, tgt.current))} title="Next save point (E)">▶◆</button>
      </div>
      <div className="mb-hint">Hold ← → (A D) to roll the head back and forward · Q / E jump between save points · drag the ground · loud = hills, colour = brightness · Esc leaves</div>
    </div>,
    document.body,
  );
}
