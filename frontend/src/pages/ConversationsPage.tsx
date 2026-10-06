import { useMemo } from "react";
import { Link } from "react-router-dom";
import { SignalBars, SpaceGlyph } from "../components/SpaceGlyph";
import { loadConversations, useLoaded } from "../lib/hubs";
import { usePresenceStore } from "../lib/presenceStore";
import { timeAgo } from "../lib/relativeTime";
import { countByKind, filterConversations, KIND_LABEL, SIGNAL_LABEL, sortConversations, type ConversationFilter, type ConversationSort } from "../lib/spaceHubs";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useUrlParams } from "../lib/useUrlParams";

const FILTERS: { id: ConversationFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "branch", label: "Branches" },
  { id: "topic", label: "Topics" },
  { id: "study", label: "Studies" },
  { id: "question", label: "Questions" },
];
const SORTS: { id: ConversationSort; label: string }[] = [
  { id: "recent", label: "Most recent" },
  { id: "busy", label: "Busiest this week" },
  { id: "az", label: "A to Z" },
];
const HOUR = 3_600_000;

export function ConversationsPage() {
  useDocumentTitle("Conversations");
  const { data, failed } = useLoaded(loadConversations);
  const [params, setParam] = useUrlParams();
  const viewers = usePresenceStore((s) => s.viewersByChannel);

  // The view lives in the address, so a filtered list can be linked and the back button works.
  const kindParam = params.get("kind");
  const kind: ConversationFilter = FILTERS.some((f) => f.id === kindParam) ? (kindParam as ConversationFilter) : "all";
  const sortParam = params.get("sort");
  const sort: ConversationSort = SORTS.some((s) => s.id === sortParam) ? (sortParam as ConversationSort) : "recent";
  const query = params.get("q") ?? "";

  const all = data?.conversations ?? [];
  const counts = useMemo(() => countByKind(all), [all]);
  const shown = useMemo(() => sortConversations(filterConversations(all, kind, query), sort), [all, kind, query, sort]);
  const hereNow = useMemo(() => [...viewers.values()].reduce((n, v) => n + v.length, 0), [viewers]);
  const now = Date.now();

  return (
    <div className="home-page space-page" data-testid="conversations-page">
      <header className="home-hero">
        <h1>Conversations</h1>
        <p className="home-lede">Signals from across the system. Pick one up.</p>
        <p className="home-stats" data-testid="conv-summary">
          {data ? (
            <>
              <span>{data.totals.conversations} conversations</span>
              <span>{data.totals.week.toLocaleString()} messages this week</span>
              {hereNow > 0 && <span>{hereNow} in chat now</span>}
            </>
          ) : "\u00a0"}
        </p>
      </header>

      <section aria-label="Find a conversation">
        <div className="space-controls">
          <input
            type="search"
            className="space-search"
            placeholder="Search conversations"
            aria-label="Search conversations"
            value={query}
            onChange={(e) => setParam("q", e.target.value, "")}
            data-testid="conv-search"
          />
          <label className="space-sort">
            <span className="home-dim">Sort</span>
            <select value={sort} onChange={(e) => setParam("sort", e.target.value, "recent")} aria-label="Sort conversations" data-testid="conv-sort">
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        </div>
        <div className="space-chips" role="group" aria-label="Kind of conversation">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className="space-chip" aria-pressed={kind === f.id} onClick={() => setParam("kind", f.id, "all")} data-testid={`conv-filter-${f.id}`} disabled={f.id !== "all" && counts[f.id] === 0}>
              {f.label} <span className="space-chip-n">{counts[f.id]}</span>
            </button>
          ))}
          <span className="space-chips-links">
            <Link to="/discussion/map">Map view</Link>
            <Link to="/discussion">Classic list</Link>
          </span>
        </div>
      </section>

      {!data ? (
        <div className="home-placeholder" aria-busy={!failed}>{failed ? "Couldn't load the conversations. Reload to try again." : "Listening for signals…"}</div>
      ) : shown.length === 0 ? (
        <p className="home-dim" data-testid="conv-empty">
          {all.length === 0 ? "No conversations yet." : "No signals match. Try fewer words, or clear the filter."}
        </p>
      ) : (
        <div className="space-grid" data-testid="conv-list" aria-live="polite">
          {shown.map((c) => {
            const here = viewers.get(c.slug)?.length ?? 0;
            const live = c.lastAt !== null && now - c.lastAt < HOUR;
            return (
              <article key={c.slug} className="sig-card" data-kind={c.kind} data-slug={c.slug}>
                <span className="sig-glyph"><SpaceGlyph kind={c.kind} /></span>
                <div className="sig-main">
                  <h3 className="sig-title"><Link className="sig-link" to={c.href}>{c.name}</Link></h3>
                  <div className="sig-badges">
                    <span className="sig-badge">{KIND_LABEL[c.kind]}</span>
                    {c.kind === "topic" && c.category && <span className="sig-badge sig-badge-soft">{c.category}</span>}
                    {c.kind === "branch" && c.branch && c.branch.name !== c.name && <span className="sig-badge sig-badge-soft">{c.branch.name}</span>}
                    {c.studies.slice(0, 2).map((s) => <Link key={s.slug} to={`/study/${s.slug}`} className="sig-badge sig-badge-link" title={s.title}>{s.title}</Link>)}
                    {c.studies.length > 2 && <span className="sig-badge sig-badge-soft">+{c.studies.length - 2} more</span>}
                  </div>
                  {c.lastText ? (
                    <p className="sig-last">{c.lastText}<span className="home-dim"> · {c.lastAt ? timeAgo(c.lastAt) : ""}</span></p>
                  ) : (
                    <p className="sig-last home-dim">{c.blurb || "No messages yet."}</p>
                  )}
                  <p className="sig-meta home-dim">
                    {c.week} this week · {c.voices} {c.voices === 1 ? "voice" : "voices"} · {c.total.toLocaleString()} in all
                    {here > 0 && <span className="sig-here"> · {here} here now</span>}
                  </p>
                </div>
                <div className="sig-side">
                  {live && <span className="beacon" aria-hidden="true" title="Active in the last hour" />}
                  <SignalBars level={c.level} label={SIGNAL_LABEL[c.level]} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
