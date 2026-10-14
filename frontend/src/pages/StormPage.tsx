import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { left, notes, spokes, type StormNow } from "../lib/storm";
import { useDocumentTitle } from "../lib/useDocumentTitle";

/** The picture is drawn once (and again when the box changes size). Nothing animates, so it costs nothing while it sits there. */
function drawArtifact(cv: HTMLCanvasElement, a: NonNullable<StormNow["artifact"]>): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5), w = cv.clientWidth, h = cv.clientHeight;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const g = cv.getContext("2d"); if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const css = getComputedStyle(document.documentElement), c1 = css.getPropertyValue("--accent-forum").trim() || "#e2703f", c2 = css.getPropertyValue("--accent-audio").trim() || "#4fa8e0";
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.46;
  g.lineCap = "round";
  for (let k = 1; k <= 4; k++) { g.beginPath(); g.arc(cx, cy, (R * k) / 4, 0, Math.PI * 2); g.strokeStyle = c2; g.globalAlpha = 0.12; g.lineWidth = 1; g.stroke(); }
  for (const s of spokes(a.seed, a.arms)) {
    const L = R * s.length;
    g.beginPath();
    for (let t = 0; t <= 1.0001; t += 0.05) { const ang = s.angle + s.sway * t * t * 1.6, rr = L * t; const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr; if (t === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.strokeStyle = s.kind === "track" ? c1 : s.kind === "lore" ? c2 : "#cfcdb4"; g.globalAlpha = 0.9; g.lineWidth = 2.2; g.stroke();
    const ex = cx + Math.cos(s.angle + s.sway * 1.6) * L, ey = cy + Math.sin(s.angle + s.sway * 1.6) * L;
    g.beginPath(); g.arc(ex, ey, 3.2, 0, Math.PI * 2); g.fillStyle = "#fff"; g.globalAlpha = 0.95; g.fill();
  }
  g.globalAlpha = 1; g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.fillStyle = c1; g.fill();
}

let ctx: AudioContext | null = null;
function playNotes(a: NonNullable<StormNow["artifact"]>): void {
  if (typeof AudioContext === "undefined") return;
  ctx = ctx ?? new AudioContext(); void ctx.resume();
  let t = ctx.currentTime + 0.05;
  for (const n of notes(a.seed, a.arms)) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "triangle"; o.frequency.value = n.hz;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0005, t + n.beats * 0.42);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + n.beats * 0.42 + 0.05); t += n.beats * 0.4;
  }
}

/** Signal storm: a 48-hour event. Scanning feeds one shared meter; if it is full when the storm ends, the Artifact forms from what everyone scanned most. */
export function StormPage() {
  useDocumentTitle("Signal storm");
  const [s, setS] = useState<StormNow | null>(null);
  const [failed, setFailed] = useState(false);
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true, timer = 0;
    const ask = () => { api<StormNow>("/api/storm").then((r) => { if (!live) return; setS(r); if (r?.state === "active") timer = window.setTimeout(ask, 60_000); }).catch(() => live && setFailed(true)); };
    ask();
    return () => { live = false; window.clearTimeout(timer); };
  }, []);
  const art = s?.artifact ?? null;
  useEffect(() => {
    const el = cv.current; if (!el || !art) return;
    const go = () => drawArtifact(el, art);
    go();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(go) : null; ro?.observe(el);
    return () => ro?.disconnect();
  }, [art]);
  const pct = s && s.goal ? Math.min(100, Math.floor(((s.count ?? 0) / s.goal) * 100)) : 0;
  const remaining = s && s.endsAt && s.serverNow ? s.endsAt - s.serverNow : 0;
  return (
    <div className="page-column" style={{ maxWidth: 680 }} data-testid="storm-page">
      <h1>Signal storm</h1>
      {failed ? <p className="home-dim">Couldn't reach the signal.</p> : !s ? <p className="home-dim">Listening…</p> : s.locked ? (
        <p className="home-dim" data-testid="storm-locked">Quiet for now. When the community reaches the Signal storm milestone, a 48-hour storm begins here.</p>
      ) : (
        <>
          <p className="home-dim" style={{ fontSize: "0.9rem" }}>Every new thing scanned in Probe mode during the storm feeds one meter. Fill it before the storm ends and the Artifact forms from what everyone scanned most.</p>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Storm meter" data-testid="storm-meter" style={{ height: 14, border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg-inset)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent-forum)" }} data-testid="storm-fill" />
          </div>
          <p style={{ margin: "0.4rem 0" }} data-testid="storm-status">
            {s.state === "active"
              ? <>{pct}% · {s.count} of {s.goal} scans · the storm ends in {left(remaining)}{s.full && " · the meter is full: the Artifact forms when the storm ends"}</>
              : s.full ? <>The storm is over and the meter was full.</> : <>The storm is over. The meter reached {pct}%: nothing opened this time.</>}
          </p>
          {s.state === "active" && <p style={{ fontSize: "0.85rem" }}>Scan with <Link to="/field-log">Probe mode</Link> (I) on any page. Things you already scanned don't count again.</p>}
          {art && (
            <section data-testid="storm-artifact" aria-label="The Artifact" style={{ marginTop: "1rem" }}>
              <h2 style={{ marginBottom: "0.3rem" }}>The Artifact</h2>
              <canvas ref={cv} role="img" aria-label={`A ${art.arms.length}-spoked figure drawn from ${art.total} scans`} style={{ width: "100%", height: 360, border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg-inset)" }} data-testid="storm-canvas" />
              <p className="home-dim" style={{ fontSize: "0.85rem" }}>{art.total} scans in 48 hours. Each spoke is one of the most scanned things; the longer the spoke, the more people scanned it. Orange: tracks, blue: lore, pale: people (never named).</p>
              <button className="btn btn-primary" onClick={() => playNotes(art)} data-testid="storm-play">Hear it</button>
              <ol style={{ fontSize: "0.85rem" }} data-testid="storm-arms">{art.arms.map((a, i) => <li key={i}>{a.label ?? "someone"} <span className="home-dim">· {a.n}</span></li>)}</ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}
