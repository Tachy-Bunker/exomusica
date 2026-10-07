import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { dayLabel, linePath, niceMax, peakOf, areaPath, tracePoints, type Box } from "../lib/traces";
import { SCOPE_COLORS, SCOPE_DEFAULT, SCOPE_MAX, addToScope, defaultScope, loadScope, normalizeScope, removeFromScope, saveScope } from "../lib/scopeChoice";
import type { ConversationsData } from "../lib/spaceHubs";

// A wide, low window: 40% of the height it used to have.
const BOX: Box = { w: 640, h: 76, padX: 34, padY: 12 };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** The scope: messages per day for the last 14 days, for the channels you choose (the eight busiest to begin with). Point at it (or tap) to read a day. */
export function ScopePanel({ data, now }: { data: ConversationsData; now: number }) {
  const [saved, setSaved] = useState<unknown>(() => loadScope());
  const [showAll, setShowAll] = useState(true);
  const [hover, setHover] = useState<{ i: number; px: number; py: number; vx: number; vy: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const list = useMemo(() => normalizeScope(saved, data.conversations), [saved, data.conversations]);
  const changed = (next: string[]) => { setSaved(next); saveScope(next); };
  const bySlug = useMemo(() => new Map(data.conversations.map((c) => [c.slug, c])), [data.conversations]);
  const shown = list.map((s) => bySlug.get(s)!).filter(Boolean);
  const top = Math.max(0, ...shown.flatMap((c) => c.trace), ...(showAll ? data.trace : []));
  const scale = niceMax(top);
  const sys = useMemo(() => tracePoints(data.trace, BOX, scale), [data.trace, scale]);
  const chanPts = useMemo(() => shown.map((c) => tracePoints(c.trace, BOX, scale)), [shown, scale]);
  const peak = peakOf(showAll ? data.trace : new Array(14).fill(0).map((_, i) => shown.reduce((n, c) => n + c.trace[i], 0)));
  const addable = data.conversations.filter((c) => !list.includes(c.slug)).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const colorOf = (slug: string) => SCOPE_COLORS[list.indexOf(slug) % SCOPE_COLORS.length];

  // A touch outside the scope puts the readout away (a mouse just leaving does the same).
  useEffect(() => {
    if (!hover) return;
    const away = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setHover(null); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [hover !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const point = (e: ReactPointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * BOX.w;
    const vy = ((e.clientY - r.top) / r.height) * BOX.h;
    const i = clamp(Math.round(((vx - BOX.padX) / (BOX.w - 2 * BOX.padX)) * 13), 0, 13); // the nearest day
    setHover({ i, px: e.clientX - r.left, py: e.clientY - r.top, vx: clamp(vx, BOX.padX, BOX.w - BOX.padX), vy: clamp(vy, BOX.padY, BOX.h - BOX.padY) });
  };
  const rowsAtHover = hover
    ? [...shown.map((c) => ({ key: c.slug, name: c.name, color: colorOf(c.slug), value: c.trace[hover.i] })), ...(showAll ? [{ key: "__all", name: "All channels", color: "var(--accent-audio)", value: data.trace[hover.i] }] : [])].sort((a, b) => b.value - a.value)
    : [];
  const wrapW = wrapRef.current?.clientWidth ?? 0;

  return (
    <section className="inst-panel scope" aria-labelledby="scope-h" data-testid="inst-scope">
      <header className="inst-head">
        <h2 id="scope-h" className="inst-title">Scope</h2>
        {peak && <span className="inst-dim" data-testid="scope-peak">peak {peak.value} · {dayLabel(peak.ago, now)}</span>}
      </header>
      <div className="scope-wrap" ref={wrapRef}>
        <svg className="inst-scope" viewBox={`0 0 ${BOX.w} ${BOX.h}`} role="img" style={{ touchAction: "pan-y" }}
          aria-label={`Messages per day over the last 14 days for ${shown.length} channel${shown.length === 1 ? "" : "s"}${showAll ? " and all channels together" : ""}. ${peak ? `Busiest day: ${peak.value} messages, ${dayLabel(peak.ago, now)}.` : "No messages in this period."} Point at it or tap it to read a day.`}
          onPointerMove={point} onPointerDown={point} onPointerLeave={(e) => { if (e.pointerType === "mouse") setHover(null); }}>
          {[0, 0.5, 1].map((f) => { const y = BOX.h - BOX.padY - f * (BOX.h - 2 * BOX.padY); return <g key={f}><line className="inst-grid" x1={BOX.padX} x2={BOX.w - BOX.padX} y1={y} y2={y} /><text className="inst-axis" x={BOX.padX - 6} y={y + 3} textAnchor="end">{Math.round(scale * f)}</text></g>; })}
          {sys.map((p, i) => <line key={i} className="inst-grid inst-grid-v" x1={p.x} x2={p.x} y1={BOX.padY} y2={BOX.h - BOX.padY} />)}
          {showAll && <><path className="inst-area" d={areaPath(sys, BOX)} /><path className="inst-trace" d={linePath(sys)} data-testid="scope-system" /></>}
          {shown.map((c, i) => <path key={c.slug} className="inst-trace-thin scope-line" d={linePath(chanPts[i])} style={{ stroke: colorOf(c.slug) }} data-testid="scope-channel" data-slug={c.slug} />)}
          <text className="inst-axis" x={BOX.padX} y={BOX.h - 1}>13 days ago</text>
          <text className="inst-axis" x={BOX.w / 2} y={BOX.h - 1} textAnchor="middle">7 days ago</text>
          <text className="inst-axis" x={BOX.w - BOX.padX} y={BOX.h - 1} textAnchor="end">today</text>
          {hover && (
            <g className="scope-cross" pointerEvents="none" data-testid="scope-cross">
              <line className="scope-snap" x1={sys[hover.i].x} x2={sys[hover.i].x} y1={BOX.padY} y2={BOX.h - BOX.padY} />
              <line x1={hover.vx} x2={hover.vx} y1={BOX.padY} y2={BOX.h - BOX.padY} data-testid="scope-cross-v" />
              <line x1={BOX.padX} x2={BOX.w - BOX.padX} y1={hover.vy} y2={hover.vy} data-testid="scope-cross-h" />
              {shown.map((c, i) => <circle key={c.slug} cx={chanPts[i][hover.i].x} cy={chanPts[i][hover.i].y} r="2.6" fill={colorOf(c.slug)} />)}
            </g>
          )}
        </svg>
        {hover && (
          <div className="scope-tip" role="status" data-testid="scope-tip" data-day={hover.i} style={{ left: hover.px, top: hover.py, transform: hover.px > wrapW * 0.6 ? "translate(calc(-100% - 14px), -50%)" : "translate(14px, -50%)" }}>
            <b>{dayLabel(13 - hover.i, now)}</b>
            <ul>{rowsAtHover.map((r) => <li key={r.key} className={r.value === 0 ? "zero" : undefined}><span><i style={{ background: r.color }} aria-hidden="true" />{r.name}</span><b>{r.value}</b></li>)}</ul>
          </div>
        )}
      </div>
      <ul className="scope-chips" aria-label="Channels on the scope" data-testid="scope-chips">
        {shown.map((c) => (
          <li key={c.slug} className="scope-chip" style={{ ["--c" as string]: colorOf(c.slug) }} data-slug={c.slug}>
            <i aria-hidden="true" />{c.name}
            <button type="button" onClick={() => changed(removeFromScope(list, c.slug))} aria-label={`Remove ${c.name} from the scope`} data-testid="scope-remove">×</button>
          </li>
        ))}
        {shown.length === 0 && <li className="inst-dim">No channels chosen. Add some below.</li>}
      </ul>
      <div className="scope-tools">
        <select value="" onChange={(e) => { if (e.target.value) changed(addToScope(list, e.target.value)); }} aria-label="Add a channel to the scope" disabled={addable.length === 0 || list.length >= SCOPE_MAX} data-testid="scope-add">
          <option value="">{list.length >= SCOPE_MAX ? `Up to ${SCOPE_MAX} channels` : "Add a channel…"}</option>
          {addable.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <button type="button" className="space-chip" aria-pressed={showAll} onClick={() => setShowAll((v) => !v)} data-testid="scope-all">All channels together</button>
        <button type="button" className="space-chip" onClick={() => { setSaved(null); saveScope(null); }} data-testid="scope-reset">Busiest {SCOPE_DEFAULT}</button>
      </div>
      <details className="inst-table"><summary>Show the numbers</summary>
        <table><thead><tr><th scope="col">Channel</th><th scope="col">14 days</th><th scope="col">Today</th></tr></thead>
          <tbody>{shown.map((c) => <tr key={c.slug}><td>{c.name}</td><td>{c.trace.reduce((a, b) => a + b, 0)}</td><td>{c.trace[13]}</td></tr>)}
            {showAll && <tr><td>All channels</td><td>{data.trace.reduce((a, b) => a + b, 0)}</td><td>{data.trace[13]}</td></tr>}</tbody></table>
      </details>
    </section>
  );
}
