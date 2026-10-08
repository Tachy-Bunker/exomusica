import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MemberAddIcon } from "../components/ActivityIcons";
import { InstrumentView } from "../components/InstrumentView";
import { MissionStatus } from "../components/MissionStatus";
import { ScopePanel } from "../components/ScopePanel";
import { SignalBars, SpaceGlyph } from "../components/SpaceGlyph";
import { api } from "../lib/api";
import { useHome } from "../lib/home";
import { loadConversations, useLoaded } from "../lib/hubs";
import { usePresenceStore } from "../lib/presenceStore";
import { timeAgo } from "../lib/relativeTime";
import { countByKind, filterConversations, groupForList, KIND_LABEL, SIGNAL_LABEL, sortConversations, normalizeConversations, type ConversationFilter, type ConversationSort, type ConversationsData } from "../lib/spaceHubs";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useLivePoll } from "../lib/livePoll";
import { useOpenInDock } from "../lib/useOpenInDock";
import { useUrlParams } from "../lib/useUrlParams";

// The forum map is big: it is only fetched when the Map view is chosen.
const ForumMap = lazy(() => import("./ForumMapPage").then((m) => ({ default: m.ForumMapPage })));

type View = "instrument" | "list" | "map";
const VIEWS: { id: View; label: string }[] = [{ id: "list", label: "List" }, { id: "instrument", label: "Instrument" }, { id: "map", label: "Map" }];
const FILTERS: { id: ConversationFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "branch", label: "Branches" },
  { id: "topic", label: "Topics" },
  { id: "study", label: "Studies" },
];
const SORTS: { id: ConversationSort; label: string }[] = [
  { id: "recent", label: "Most recent" },
  { id: "busy", label: "Busiest this week" },
  { id: "az", label: "A to Z" },
];
const HOUR = 3_600_000;

export function ConversationsPage() {
  useDocumentTitle("Telemetry");
  const { data: first, failed } = useLoaded(loadConversations);
  const [data, setData] = useState<ConversationsData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [tick, setTick] = useState(Date.now());
  const onOpen = useOpenInDock();
  useEffect(() => { if (first) setData(normalizeConversations(first)); }, [first]);
  const refresh = useCallback(() => {
    setRefreshing(true);
    return api<ConversationsData>("/api/conversations").then((d) => setData(normalizeConversations(d))).catch(() => {}).finally(() => setRefreshing(false));
  }, []);

  useEffect(() => { const id = window.setInterval(() => setTick(Date.now()), 15_000); return () => window.clearInterval(id); }, []); // "5 min ago" stays true without refetching
  const [params, setParam] = useUrlParams();
  const viewers = usePresenceStore((s) => s.viewersByChannel);

  // The view lives in the address, so a filtered list can be linked and the back button works.
  const kindParam = params.get("kind");
  const kind: ConversationFilter = FILTERS.some((f) => f.id === kindParam) ? (kindParam as ConversationFilter) : "all";
  const sortParam = params.get("sort");
  const sort: ConversationSort = SORTS.some((s) => s.id === sortParam) ? (sortParam as ConversationSort) : "recent";
  const query = params.get("q") ?? "";
  const viewParam = params.get("view");
  const view: View = viewParam === "instrument" || viewParam === "map" ? viewParam : "list"; // the grouped list comes first
  // The live data refreshes only while it is shown (not in the Map view), the tab is visible and the visitor is around; the server also
  // keeps one shared copy for 15 seconds and works nothing out unless asked, so an idle tab costs nothing.
  const refreshNow = useLivePoll(refresh, !!data && view !== "map");

  const all = data?.conversations ?? [];
  const counts = useMemo(() => countByKind(all), [all]);
  const shown = useMemo(() => sortConversations(filterConversations(all, kind, query), sort), [all, kind, query, sort]);
  const { home } = useHome();
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  useEffect(() => { api<{ categoryOrder: string[] | null }>("/api/site-settings").then((s) => setCategoryOrder(s.categoryOrder ?? [])).catch(() => {}); }, []);
  const seedChats = useMemo(() => new Set((home?.branches ?? []).filter((b) => b.seed && b.chatSlug).map((b) => b.chatSlug!)), [home]);
  const groups = useMemo(() => groupForList(filterConversations(all, "all", query), categoryOrder, seedChats), [all, query, categoryOrder, seedChats]);
  const hereNow = useMemo(() => [...viewers.values()].reduce((n, v) => n + v.length, 0), [viewers]);
  const now = tick;

  return (
    <div className="home-page space-page" data-testid="conversations-page">
      <header className="conv-head">
        <h1>Telemetry</h1>
        <Link className="conv-members" to="/members" aria-label="Members" title="Members" data-testid="conv-members"><MemberAddIcon size={22} /></Link>
        {data && <MissionStatus data={data} hereNow={hereNow} now={now} />}
      </header>

      <section aria-label="Find a conversation">
        <div className="space-controls conv-controls">
          <div className="view-switch" role="group" aria-label="How to show conversations">
            {VIEWS.map((v) => <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setParam("view", v.id, "list")} data-testid={`view-${v.id}`}>{v.label}</button>)}
          </div>
          {view !== "map" && (
            <>
              <input type="search" className="space-search" placeholder="Search conversations" aria-label="Search conversations" value={query} onChange={(e) => setParam("q", e.target.value, "")} data-testid="conv-search" />
              {view === "instrument" && (
                <>
              <label className="space-sort">
                <span className="home-dim">Sort</span>
                <select value={sort} onChange={(e) => setParam("sort", e.target.value, "recent")} aria-label="Sort conversations" data-testid="conv-sort">
                  {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
              <div className="space-chips" role="group" aria-label="Kind of conversation">
                {FILTERS.map((f) => (
                  <button key={f.id} type="button" className="space-chip" aria-pressed={kind === f.id} onClick={() => setParam("kind", f.id, "all")} data-testid={`conv-filter-${f.id}`} disabled={f.id !== "all" && counts[f.id] === 0}>
                    {f.label} <span className="space-chip-n">{counts[f.id]}</span>
                  </button>
                ))}
              </div>
                </>
              )}
            </>
          )}
        </div>
      </section>

      {view === "map" ? (
        <div className="conv-map" data-testid="conv-map" aria-label="Forum map">
          <Suspense fallback={<p className="home-dim" style={{ padding: "1rem" }}>Opening the map…</p>}><ForumMap embedded onViewAsList={() => setParam("view", "list", "list")} /></Suspense>
        </div>
      ) : !data ? (
        <div className="home-placeholder" aria-busy={!failed}>{failed ? "Couldn't load the conversations. Reload to try again." : "Listening for signals…"}</div>
      ) : view === "instrument" ? (
        <InstrumentView data={data} rows={shown} onRefresh={refreshNow} refreshing={refreshing} showAll={showAll} onShowAll={() => setShowAll(true)} now={now} onOpen={onOpen} />
      ) : (
        <>
          <ScopePanel data={data} now={now} />
          {groups.length === 0 ? (
            <p className="home-dim" data-testid="conv-empty">{all.length === 0 ? "No conversations yet." : "No signals match. Try fewer words."}</p>
          ) : (
            <div className="tlist" data-testid="conv-list" aria-live="polite">
              {groups.map((g) => (
                <section key={g.key} className="tlist-group" aria-labelledby={`tl-${g.key}`}>
                  <h2 id={`tl-${g.key}`} className="tlist-title">{g.title} <span>({g.items.length})</span></h2>
                  <ul className="tlist-rows">
                    {g.items.map((c) => {
                      const here = viewers.get(c.slug)?.length ?? 0;
                      const live1h = c.lastAt !== null && now - c.lastAt < HOUR;
                      return (
                        <li key={c.slug} className="tlist-row sig-card" data-kind={c.kind} data-slug={c.slug}>
                          <span className="sig-glyph"><SpaceGlyph kind={c.kind} /></span>
                          <span className="tlist-main">
                            <Link className="sig-link" to={c.href} onClick={(e) => onOpen(e, { slug: c.slug, name: c.name, branchSlug: c.branch?.slug })}>{c.name}</Link>
                            <span className="tlist-desc home-dim" data-testid="conv-desc">{c.blurb}{c.kind === "study" && c.studies[0] ? c.studies[0].title : ""}</span>
                          </span>
                          <span className="tlist-side home-dim">
                            {here > 0 && <span className="sig-here">{here} here · </span>}
                            <span data-testid="conv-ago">{c.lastAt ? timeAgo(c.lastAt, now) : "no signals"}</span>
                            {live1h && <span className="beacon" aria-hidden="true" title="Active in the last hour" />}
                            <SignalBars level={c.level} label={SIGNAL_LABEL[c.level]} />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
