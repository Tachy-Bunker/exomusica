import { Username } from "./Username";
import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import { RefreshIcon } from "./Icons";
import { SignalBars, SpaceGlyph } from "./SpaceGlyph";
import { timeAgo } from "../lib/relativeTime";
import { KIND_LABEL, SIGNAL_LABEL, type Conversation, type ConversationsData } from "../lib/spaceHubs";
import { linePath, niceMax, tracePoints, type Box } from "../lib/traces";

const SPARK: Box = { w: 150, h: 34, padX: 2, padY: 4 };
const BOARD_ROWS = 12;
type Opener = (e: MouseEvent, chat: { slug: string; name: string; branchSlug?: string | null }) => void;

/** The instrument view of Conversations: a trace per channel and the live feed. (The status sits beside the page title; the scope is in the List view.) */
export function InstrumentView({ data, rows, onRefresh, refreshing, showAll, onShowAll, now, onOpen }: {
  data: ConversationsData; rows: Conversation[]; onRefresh: () => void; refreshing: boolean; showAll: boolean; onShowAll: () => void; now: number; onOpen: Opener;
}) {
  const shown = showAll ? rows : rows.slice(0, BOARD_ROWS);
  return (
    <div className="inst" data-testid="instrument">
      <div className="inst-main">
        <section className="inst-panel" aria-labelledby="inst-board-h" data-testid="inst-board">
          {rows.length === 0 ? <p className="inst-dim" data-testid="conv-empty"><span id="inst-board-h" className="sr-only">Channels</span>{data.conversations.length === 0 ? "No conversations yet." : "No signals match. Try fewer words, or clear the filter."}</p> : (
            <>
              <div className="inst-cols inst-dim"><span aria-hidden="true" /><h2 id="inst-board-h" className="inst-cols-title" data-testid="inst-board-title">Channel <span>({rows.length})</span></h2><span aria-hidden="true">Signals</span><span className="inst-cols-num" aria-hidden="true">This week</span><span aria-hidden="true">Last signal</span></div>
              <ul className="inst-rows" data-testid="conv-list">
                {shown.map((c) => (
                  <li key={c.slug} className="inst-row sig-card" data-kind={c.kind} data-slug={c.slug}>
                    <span className="sig-glyph inst-glyph"><SpaceGlyph kind={c.kind} /></span>
                    <span className="inst-row-name"><Link className="sig-link" to={c.href} onClick={(e) => onOpen(e, { slug: c.slug, name: c.name, branchSlug: c.branch?.slug })}>{c.name}</Link><span className="inst-dim"> {KIND_LABEL[c.kind]}{c.kind === "study" && c.studies[0] ? ` · ${c.studies[0].title}` : ""}</span></span>
                    <svg className="inst-spark" viewBox={`0 0 ${SPARK.w} ${SPARK.h}`} role="img" aria-label={`${c.trace.reduce((a, b) => a + b, 0)} messages in the last 14 days`}>
                      <line className="inst-grid" x1="0" x2={SPARK.w} y1={SPARK.h - SPARK.padY} y2={SPARK.h - SPARK.padY} />
                      <path className="inst-spark-line" d={linePath(tracePoints(c.trace, SPARK, Math.max(4, niceMax(Math.max(...c.trace)))))} style={{ stroke: "var(--kind)" }} />
                    </svg>
                    <span className="inst-num" data-testid="row-week">{c.week}</span>
                    <span className="inst-last"><span data-testid="row-last">{c.lastAt ? timeAgo(c.lastAt, now) : "none yet"}</span><SignalBars level={c.level} label={SIGNAL_LABEL[c.level]} /></span>
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
          <button type="button" className={`inst-refresh${refreshing ? " spinning" : ""}`} onClick={onRefresh} aria-label="Refresh now" title="Refresh now (it also refreshes by itself every 15 seconds)" data-testid="live-refresh"><RefreshIcon size={16} /></button>
        </header>
        {data.recent.length === 0 ? <p className="inst-dim">Nothing yet.</p> : (
          <ol className="inst-feed-list" data-testid="feed-list">
            {data.recent.map((m) => (
              <li key={m.id}>
                <span className="inst-feed-time inst-dim">{timeAgo(m.at, now)}</span>
                <span className="inst-feed-text"><Link to={m.href} className="inst-feed-chan" onClick={(e) => onOpen(e, { slug: m.channelSlug, name: m.channelName, branchSlug: m.branchSlug })}>{m.channelName}</Link> <Username name={m.author} /> {m.text}</span>
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
}
