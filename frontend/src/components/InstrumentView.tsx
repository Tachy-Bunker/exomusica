import { useMemo } from "react";
import { Link } from "react-router-dom";
import { SignalBars, SpaceGlyph } from "./SpaceGlyph";
import { timeAgo } from "../lib/relativeTime";
import { KIND_LABEL, SIGNAL_LABEL, type Conversation, type ConversationsData } from "../lib/spaceHubs";
import { areaPath, dayLabel, linePath, niceMax, peakOf, statusOf, topChannels, tracePoints, type Box } from "../lib/traces";

const SCOPE: Box = { w: 640, h: 170, padX: 34, padY: 18 };
const SPARK: Box = { w: 150, h: 34, padX: 2, padY: 4 };
const KIND_VAR: Record<string, string> = { branch: "var(--c-branch)", topic: "var(--c-topic)", study: "var(--c-study)", question: "var(--c-question)" };
const BOARD_ROWS = 12;
/** The busiest channels on the scope each get their own colour, clearly apart from the system line (blue). */
const TRACE_COLORS = ["#e8b86f", "#6fd3a6", "#b99cff"];

function Readout({ label, value, sub, testid, text = false }: { label: string; value: string; sub?: string; testid: string; text?: boolean }) {
  return (
    <div className="inst-readout" data-testid={testid}>
      <span className="inst-label">{label}</span>
      <span className={`inst-value${text ? " inst-value-text" : ""}`}>{value}</span>
      {sub && <span className="inst-sub">{sub}</span>}
    </div>
  );
}

/** The default view of Conversations: readouts, a scope, a trace per channel, and the live feed - a small working instrument. */
export function InstrumentView({ data, rows, hereNow, live, onToggleLive, updatedAt, showAll, onShowAll, now }: {
  data: ConversationsData; rows: Conversation[]; hereNow: number; live: boolean; onToggleLive: () => void; updatedAt: number; showAll: boolean; onShowAll: () => void; now: number;
}) {
  const status = statusOf(data.totals.day, data.trace);
  const peak = peakOf(data.trace);
  const top = topChannels(data.conversations, 3);
  const scale = niceMax(Math.max(0, ...data.trace));
  const sysPts = useMemo(() => tracePoints(data.trace, SCOPE, scale), [data.trace, scale]);
  const shown = showAll ? rows : rows.slice(0, BOARD_ROWS);

  return (
    <div className="inst" data-testid="instrument">
      <div className="inst-main">
        <section className="inst-panel" aria-labelledby="inst-status-h" data-testid="inst-status">
          <header className="inst-head">
            <h2 id="inst-status-h" className="inst-title">Mission status</h2>
            <span className={`inst-lamp inst-lamp-${status.word.toLowerCase()}`} data-testid="inst-lamp" title="The last 24 hours compared with the daily average of the 13 days before">
              <i aria-hidden="true" /> {status.word}
            </span>
          </header>
          <div className="inst-readouts">
            <Readout testid="ro-channels" label="Channels" value={String(data.totals.conversations)} sub={`${data.totals.activeChats} active this week`} />
            <Readout testid="ro-day" label="Last 24 h" value={data.totals.day.toLocaleString()} sub={data.totals.day === 1 ? "message" : "messages"} />
            <Readout testid="ro-week" label="This week" value={data.totals.week.toLocaleString()} sub={data.totals.week === 1 ? "message" : "messages"} />
            <Readout testid="ro-signal" label="Last signal" text value={data.totals.lastSignalAt ? timeAgo(data.totals.lastSignalAt, now) : "none yet"} />
            {hereNow > 0 && <Readout testid="ro-here" label="In chat now" value={String(hereNow)} sub="logged-in members" />}
          </div>
        </section>

        <section className="inst-panel" aria-labelledby="inst-scope-h" data-testid="inst-scope">
          <header className="inst-head">
            <h2 id="inst-scope-h" className="inst-title">Scope <span className="inst-dim">messages per day, last 14 days</span></h2>
            {peak && <span className="inst-dim" data-testid="scope-peak">peak {peak.value} · {dayLabel(peak.ago, now)}</span>}
          </header>
          <svg className="inst-scope" viewBox={`0 0 ${SCOPE.w} ${SCOPE.h}`} role="img" aria-label={`Messages per day over the last 14 days. ${peak ? `Busiest day: ${peak.value} messages, ${dayLabel(peak.ago, now)}.` : "No messages in this period."} Today: ${data.trace[13] ?? 0}.`}>
            {[0, 0.25, 0.5, 0.75, 1].map((f) => { const y = SCOPE.h - SCOPE.padY - f * (SCOPE.h - 2 * SCOPE.padY); return <g key={f}><line className="inst-grid" x1={SCOPE.padX} x2={SCOPE.w - SCOPE.padX} y1={y} y2={y} /><text className="inst-axis" x={SCOPE.padX - 6} y={y + 3} textAnchor="end">{Math.round(scale * f)}</text></g>; })}
            {sysPts.map((p, i) => <line key={i} className="inst-grid inst-grid-v" x1={p.x} x2={p.x} y1={SCOPE.padY} y2={SCOPE.h - SCOPE.padY} />)}
            {top.map((c, i) => <path key={c.slug} className="inst-trace-thin" d={linePath(tracePoints(c.trace, SCOPE, scale))} style={{ stroke: TRACE_COLORS[i] }} data-testid="scope-channel" />)}
            <path className="inst-area" d={areaPath(sysPts, SCOPE)} />
            <path className="inst-trace" d={linePath(sysPts)} data-testid="scope-system" />
            {peak && <circle className="inst-peak" cx={sysPts[sysPts.length - 1 - peak.ago].x} cy={sysPts[sysPts.length - 1 - peak.ago].y} r="3.5" />}
            <text className="inst-axis" x={SCOPE.padX} y={SCOPE.h - 3}>13 days ago</text>
            <text className="inst-axis" x={SCOPE.w / 2} y={SCOPE.h - 3} textAnchor="middle">7 days ago</text>
            <text className="inst-axis" x={SCOPE.w - SCOPE.padX} y={SCOPE.h - 3} textAnchor="end">today</text>
          </svg>
          <p className="inst-legend">
            <span><i className="inst-key inst-key-sys" /> all channels</span>
            {top.map((c, i) => <span key={c.slug}><i className="inst-key" style={{ background: TRACE_COLORS[i] }} /> {c.name}</span>)}
          </p>
          <details className="inst-table"><summary>Show the numbers</summary>
            <table><thead><tr><th scope="col">Day</th><th scope="col">Messages</th></tr></thead>
              <tbody>{data.trace.map((n, i) => <tr key={i}><td>{dayLabel(13 - i, now)}</td><td>{n}</td></tr>).reverse()}</tbody></table>
          </details>
        </section>

        <section className="inst-panel" aria-labelledby="inst-board-h" data-testid="inst-board">
          <header className="inst-head"><h2 id="inst-board-h" className="inst-title">Channels <span className="inst-dim">{rows.length} shown</span></h2></header>
          {rows.length === 0 ? <p className="inst-dim" data-testid="conv-empty">{data.conversations.length === 0 ? "No conversations yet." : "No signals match. Try fewer words, or clear the filter."}</p> : (
            <>
              <div className="inst-cols inst-dim" aria-hidden="true"><span>Channel</span><span>14-day trace</span><span>This week</span><span>Last signal</span></div>
              <ul className="inst-rows" data-testid="conv-list">
                {shown.map((c) => (
                  <li key={c.slug} className="inst-row sig-card" data-kind={c.kind} data-slug={c.slug}>
                    <span className="sig-glyph inst-glyph"><SpaceGlyph kind={c.kind} /></span>
                    <span className="inst-row-name"><Link className="sig-link" to={c.href}>{c.name}</Link><span className="inst-dim"> {KIND_LABEL[c.kind]}{c.kind === "study" && c.studies[0] ? ` · ${c.studies[0].title}` : ""}</span></span>
                    <svg className="inst-spark" viewBox={`0 0 ${SPARK.w} ${SPARK.h}`} role="img" aria-label={`${c.trace.reduce((a, b) => a + b, 0)} messages in the last 14 days`}>
                      <line className="inst-grid" x1="0" x2={SPARK.w} y1={SPARK.h - SPARK.padY} y2={SPARK.h - SPARK.padY} />
                      <path className="inst-spark-line" d={linePath(tracePoints(c.trace, SPARK, Math.max(4, niceMax(Math.max(...c.trace)))))} style={{ stroke: "var(--kind)" }} />
                    </svg>
                    <span className="inst-num" data-testid="row-week">{c.week}</span>
                    <span className="inst-last">{c.lastAt ? timeAgo(c.lastAt, now) : "none yet"}</span>
                    <SignalBars level={c.level} label={SIGNAL_LABEL[c.level]} />
                  </li>
                ))}
              </ul>
              {rows.length > shown.length && <p><button type="button" className="btn" onClick={onShowAll} data-testid="board-more">Show all {rows.length} channels</button></p>}
            </>
          )}
        </section>
      </div>

      <aside className="inst-panel inst-feed" aria-labelledby="inst-feed-h" data-testid="inst-feed">
        <header className="inst-head">
          <h2 id="inst-feed-h" className="inst-title">Live activity</h2>
          <button type="button" className="inst-live" aria-pressed={live} onClick={onToggleLive} data-testid="live-toggle"><i aria-hidden="true" className={live ? "on" : ""} /> {live ? "Live" : "Paused"}</button>
        </header>
        <p className="inst-dim inst-updated" data-testid="feed-updated">{live ? "Refreshes about every 30 seconds. " : "Not refreshing. "}Updated {timeAgo(updatedAt, now)}.</p>
        {data.recent.length === 0 ? <p className="inst-dim">Nothing yet.</p> : (
          <ol className="inst-feed-list" data-testid="feed-list">
            {data.recent.map((m) => (
              <li key={m.id}>
                <span className="inst-feed-time inst-dim">{timeAgo(m.at, now)}</span>
                <span className="inst-feed-text"><Link to={m.href} className="inst-feed-chan">{m.channelName}</Link> <b>{m.author}</b> {m.text}</span>
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
}
