import { useEffect, useMemo, useState } from "react";
import { dayLabel, linePath, niceMax, peakOf, areaPath, tracePoints, type Box } from "../lib/traces";
import { SCOPE_COLORS, SCOPE_DEFAULT, SCOPE_MAX, addToScope, defaultScope, loadScope, normalizeScope, removeFromScope, saveScope } from "../lib/scopeChoice";
import type { ConversationsData } from "../lib/spaceHubs";

const BOX: Box = { w: 640, h: 190, padX: 34, padY: 18 };

/** The scope: messages per day for the last 14 days, for the channels you choose (the eight busiest to begin with). */
export function ScopePanel({ data, now }: { data: ConversationsData; now: number }) {
  const [saved, setSaved] = useState<unknown>(() => loadScope());
  const [showAll, setShowAll] = useState(true);
  const list = useMemo(() => normalizeScope(saved, data.conversations), [saved, data.conversations]);
  const changed = (next: string[]) => { setSaved(next); saveScope(next); };
  useEffect(() => { /* a saved list that no longer matches anything falls back to the default on its own */ }, [list]);
  const bySlug = useMemo(() => new Map(data.conversations.map((c) => [c.slug, c])), [data.conversations]);
  const shown = list.map((s) => bySlug.get(s)!).filter(Boolean);
  const top = Math.max(0, ...shown.flatMap((c) => c.trace), ...(showAll ? data.trace : []));
  const scale = niceMax(top);
  const sys = useMemo(() => tracePoints(data.trace, BOX, scale), [data.trace, scale]);
  const peak = peakOf(showAll ? data.trace : new Array(14).fill(0).map((_, i) => shown.reduce((n, c) => n + c.trace[i], 0)));
  const addable = data.conversations.filter((c) => !list.includes(c.slug)).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return (
    <section className="inst-panel scope" aria-labelledby="scope-h" data-testid="inst-scope">
      <header className="inst-head">
        <h2 id="scope-h" className="inst-title">Scope <span className="inst-dim">messages per day, last 14 days</span></h2>
        {peak && <span className="inst-dim" data-testid="scope-peak">peak {peak.value} · {dayLabel(peak.ago, now)}</span>}
      </header>
      <svg className="inst-scope" viewBox={`0 0 ${BOX.w} ${BOX.h}`} role="img" aria-label={`Messages per day over the last 14 days for ${shown.length} channel${shown.length === 1 ? "" : "s"}${showAll ? " and all channels together" : ""}. ${peak ? `Busiest day: ${peak.value} messages, ${dayLabel(peak.ago, now)}.` : "No messages in this period."}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => { const y = BOX.h - BOX.padY - f * (BOX.h - 2 * BOX.padY); return <g key={f}><line className="inst-grid" x1={BOX.padX} x2={BOX.w - BOX.padX} y1={y} y2={y} /><text className="inst-axis" x={BOX.padX - 6} y={y + 3} textAnchor="end">{Math.round(scale * f)}</text></g>; })}
        {sys.map((p, i) => <line key={i} className="inst-grid inst-grid-v" x1={p.x} x2={p.x} y1={BOX.padY} y2={BOX.h - BOX.padY} />)}
        {showAll && <><path className="inst-area" d={areaPath(sys, BOX)} /><path className="inst-trace" d={linePath(sys)} data-testid="scope-system" /></>}
        {shown.map((c, i) => <path key={c.slug} className="inst-trace-thin scope-line" d={linePath(tracePoints(c.trace, BOX, scale))} style={{ stroke: SCOPE_COLORS[list.indexOf(c.slug) % SCOPE_COLORS.length] }} data-testid="scope-channel" data-slug={c.slug} />)}
        <text className="inst-axis" x={BOX.padX} y={BOX.h - 3}>13 days ago</text>
        <text className="inst-axis" x={BOX.w / 2} y={BOX.h - 3} textAnchor="middle">7 days ago</text>
        <text className="inst-axis" x={BOX.w - BOX.padX} y={BOX.h - 3} textAnchor="end">today</text>
      </svg>
      <ul className="scope-chips" aria-label="Channels on the scope" data-testid="scope-chips">
        {shown.map((c) => (
          <li key={c.slug} className="scope-chip" style={{ ["--c" as string]: SCOPE_COLORS[list.indexOf(c.slug) % SCOPE_COLORS.length] }} data-slug={c.slug}>
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
