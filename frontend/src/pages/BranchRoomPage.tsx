import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getJson } from "../lib/sharedGet";
import { api } from "../lib/api";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { scannedIds } from "../lib/scanLog";
import { keysOf } from "../lib/fieldLog";
import { roomStates, type ChartBranch } from "../lib/chart";
import { lineageOf } from "../lib/roomTheme";
import { hashStr } from "../lib/probeCore";
import { recordVisit, visitedSlugs } from "../lib/visits";
import { loadChartBranches } from "../lib/chartLoad";
import { loadHome, type HomeData } from "../lib/home";
import { loadMilestones, type Milestone } from "../lib/milestones";
import { layoutHull, type Hull, type HullNode } from "../lib/hullLayout";
import { loadMapOverrides } from "../lib/mapOverrides";
import { buildHullRoom, buildRoom, HULL_HOST, HULL_SLUG, type RoomWorld } from "../lib/roomWorld";
import { MilestoneView } from "../components/MilestoneCard";
import { themeOf } from "../lib/headerTheme";
import { neon } from "../lib/legibleColor";
import type { Branch, BranchAlbum } from "../lib/types";
import { BranchRoom } from "../components/BranchRoom";
import { AlbumTerminal, ChatTerminal, DroneTerminal, ListTerminal, LogbookTerminal, RoomTerminal, SiteIndex } from "../components/RoomTerminal";
import { PageTerminal } from "../components/PageTerminal";
import { terminalSites } from "../lib/terminal";
import type { Lore } from "../lib/roomLore";
import type { RoomProp } from "../lib/roomWorld";
import { previewLines } from "../lib/roomPreview";
import { Loading } from "../components/Loading";

const noop = (): void => undefined;

/** The branch chat heard from the room: its newest lines, one at a time, in a corner. Read-only and quiet: it asks every 30 s, and only while the tab is showing. */
function RoomTicker({ channel }: { channel: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [at, setAt] = useState(0);
  useEffect(() => {
    let alive = true;
    const pull = () => {
      if (document.hidden) return;
      api<unknown>(`/api/channels/${channel}/messages?limit=3`).then((m) => {
        const next = previewLines(m);
        if (alive) setLines((prev) => (prev.join("\n") === next.join("\n") ? prev : next));
      }).catch(() => undefined);
    };
    pull();
    const timer = window.setInterval(pull, 30_000);
    const onVis = () => { if (!document.hidden) pull(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVis); };
  }, [channel]);
  useEffect(() => {
    if (lines.length < 2) return;
    const t = window.setInterval(() => setAt((x) => (x + 1) % lines.length), 6_000);
    return () => window.clearInterval(t);
  }, [lines.length]);
  if (!lines.length) return null;
  return <div className="rm-ticker" aria-hidden="true" data-testid="room-ticker">{lines[at % lines.length]}</div>;
}

/** /branch/:slug/room — the branch as a room you walk round. Doors open onto corridors that lead the way the rooms lie on the Scan map, and the room at the end is already waiting. */
export function BranchRoomPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const loc = useLocation();
  return <RoomInner key={`${slug}|${loc.key}`} slug={slug} />;
}

interface Graph { chart: ChartBranch[]; hull: Hull | null; outer: boolean }
/** Everything a room needs, loaded once: only the room you are in and the one behind your door are kept. */
interface RoomData { slug: string; branch: Branch; albums: BranchAlbum[]; color: string; world: RoomWorld }

function RoomInner({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const from = sp.get("from");
  const [cur, setCur] = useState<RoomData | null | false>(null);
  const [next, setNext] = useState<RoomData | null>(null);
  const [graph, setGraph] = useState<Graph | null | false>(null);
  const link = useRef<HTMLAnchorElement>(null);
  const [term, setTerm] = useState<RoomProp | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [droneOpen, setDroneOpen] = useState(false), [logOpen, setLogOpen] = useState(false);
  const [site, setSite] = useState<{ path: string; title: string } | null>(null);
  const [card, setCard] = useState<Milestone | null>(null); // the card of a milestone door
  const [lore, setLore] = useState<Map<string, Lore> | null>(null), [visor, setVisor] = useState({ on: false, hint: "The echo visor is not unlocked yet." });
  const openTerm = useCallback((p: RoomProp) => { setPick(null); setDroneOpen(false); setLogOpen(false); setSite(null); setCard(null); setTerm(p); }, []);
  const openDrone = useCallback(() => { setTerm(null); setPick(null); setLogOpen(false); setSite(null); setCard(null); setDroneOpen(true); }, []);
  const openLog = useCallback(() => { setTerm(null); setPick(null); setDroneOpen(false); setSite(null); setCard(null); setLogOpen(true); }, []);
  /** A page of the site, opened in a terminal in this room (from the logbook's site list). */
  const openSite = useCallback((path: string, title: string) => { setTerm(null); setPick(null); setDroneOpen(false); setLogOpen(false); setCard(null); setSite({ path, title }); }, []);
  /** A milestone door: its card. */
  const openMs = useCallback((m: Milestone) => { setTerm(null); setPick(null); setDroneOpen(false); setLogOpen(false); setSite(null); setCard(m); }, []);
  useDocumentTitle(cur ? `${cur.branch.name} (room)` : "Room");

  const visited = useRef<Set<string>>(null as unknown as Set<string>);
  if (!visited.current) { const v = visitedSlugs(); for (const k of keysOf(scannedIds())) if (k.startsWith("branch:")) v.add(k.slice(7)); v.add(slug); visited.current = v; }
  const curRef = useRef<RoomData | null>(null); curRef.current = cur || null; // the room you are in, for the Hull (entered from it)
  const graphRef = useRef<Graph | null>(null), nextRef = useRef<RoomData | null>(null), wantRef = useRef<string | null>(null), curSlug = useRef(slug), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  /** A room's data and its walkable world, built as if you had been there (so the doors a visit would open are open). */
  const loadRoom = useCallback(async (s: string, via: string | null): Promise<RoomData | false> => {
    const g = graphRef.current; if (!g) return false;
    const [branch, albums, theme] = await Promise.all([getJson<Branch>(`/api/branches/${s}`).catch(() => null), getJson<BranchAlbum[]>(`/api/branches/${s}/albums`).catch(() => [] as BranchAlbum[]), themeOf(s).catch(() => null)]);
    if (!branch || !branch.slug) return false;
    const vis = new Set(visited.current); vis.add(s);
    const states = g.chart.length ? roomStates(g.chart, vis, new Set([...vis].map(hashStr))) : null;
    const color = theme ? neon(theme.color) : "#5fd3ee";
    const mile = s === HULL_HOST ? await loadMilestones().catch(() => [] as Milestone[]) : null; // the Core is where the Hull's door is, and that door depends on the milestones
    const world = buildRoom({ hull: g.hull, slug: s, name: branch.name, states, albums: (albums ?? []).map((a) => ({ slug: a.slug, title: a.title })), channelSlug: branch.channel?.slug ?? null, from: via, milestones: mile });
    world.color = color; world.blurb = branch.description ?? undefined; world.lineage = lineageOf(g.chart, s);
    if (branch.channel?.slug) { const m = await getJson<unknown>(`/api/channels/${branch.channel.slug}/messages?limit=3`).catch(() => null); const l = previewLines(m); if (l.length) world.chat = l; }
    return { slug: s, branch, albums: albums ?? [], color, world };
  }, []);

  useEffect(() => {
    let live = true;
    getJson<{ key: string; title: string; body: string }[]>("/api/lore").then((l) => { if (live && Array.isArray(l)) setLore(new Map(l.map((e) => [e.key, { title: e.title, body: e.body }]))); }).catch(() => undefined);
    loadMilestones().then((l) => { const m = l.find((x) => x.key === "m-visor"); if (live && m) setVisor({ on: m.reached, hint: m.reached ? "" : `The echo visor unlocks at ${m.target} scans (the community is at ${m.now}).` }); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  useEffect(() => {
    recordVisit(slug);
    Promise.all([loadChartBranches(visited.current).catch(() => null), loadHome().catch(() => null), loadMilestones().then((l) => !!l.find((m) => m.key === "m-ring")?.reached).catch(() => false), loadMapOverrides()]).then(async ([chart, home, outer, overrides]) => {
      if (!alive.current) return;
      const by = new Map((home ? home.branches : []).map((b) => [b.slug, b]));
      const nodes: HullNode[] = (chart || []).map((b) => ({ id: b.id, parentId: b.parentId, slug: b.slug, name: b.name, secret: b.secret, key: b.key, tracks: by.get(b.slug)?.tracks ?? 0, albums: by.get(b.slug)?.albums ?? 0 }));
      const g: Graph = { chart: chart || [], hull: nodes.length ? layoutHull(nodes, { outer, overrides }) : null, outer };
      graphRef.current = g; setGraph(g);
      const d = await loadRoom(slug, from);
      if (alive.current) setCur(d);
    });
  }, [slug, from, loadRoom]);

  /** The Hull, built from the Core room it is entered from: a ring hall whose doors are the milestones. Its branch is the Core's (its site and chat), under its own name. */
  const buildHull = useCallback(async (core: RoomData): Promise<RoomData | false> => {
    const door = core.world.doors.find((d) => d.toSlug === HULL_SLUG); if (!door) return false;
    const list = await loadMilestones().catch(() => [] as Milestone[]);
    const world = buildHullRoom({ core: core.world, door, milestones: list });
    world.color = core.color; world.lineage = core.world.lineage; world.blurb = core.world.blurb;
    return { slug: HULL_SLUG, branch: { ...core.branch, name: "The Hull" }, albums: [], color: core.color, world };
  }, []);

  /** The room behind the door you are near (null: none). Only one is kept; asking for another drops it. */
  const wantNext = useCallback((s: string | null) => {
    if (s === null) { wantRef.current = null; nextRef.current = null; setNext(null); return; }
    if (wantRef.current === s) return;
    wantRef.current = s; if (nextRef.current && nextRef.current.slug !== s) { nextRef.current = null; setNext(null); }
    const job = s === HULL_SLUG ? (curRef.current ? buildHull(curRef.current) : Promise.resolve<RoomData | false>(false)) : loadRoom(s, curSlug.current);
    void job.then((d) => { if (alive.current && d && wantRef.current === s) { nextRef.current = d; setNext(d); } });
  }, [loadRoom, buildHull]);

  /** You walked through into the room that was waiting: it becomes the room you are in, the address follows, and the one behind you is let go. */
  const advance = useCallback((s: string) => {
    const n = nextRef.current; curSlug.current = s;
    if (s !== HULL_SLUG) { visited.current.add(s); recordVisit(s); try { window.history.replaceState(window.history.state, "", `/branch/${s}/room`); } catch { /* sandboxed frame */ } } // the Hull keeps the address of the room it opens from
    setTerm(null); setPick(null); setDroneOpen(false); setLogOpen(false); setCard(null);
    nextRef.current = null; wantRef.current = null; setNext(null);
    if (n && n.slug === s) setCur(n); else void loadRoom(s, null).then((d) => { if (alive.current && d) setCur(d); });
  }, [loadRoom]);

  const here = cur || null, name = here ? here.branch.name : "";
  const back = `/branch/${here ? here.branch.slug : slug}`;
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.code === "Escape" && !document.fullscreenElement) { e.stopPropagation(); if (term || droneOpen || logOpen || site || card) { setTerm(null); setPick(null); setDroneOpen(false); setLogOpen(false); setSite(null); setCard(null); } else navigate("/explore"); } };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  }, [navigate, back, term, droneOpen, logOpen, site, card]);

  const go = useCallback((to: string, door: boolean) => {
    const el = link.current; if (!el) return;
    el.setAttribute("href", to);
    if (door) el.setAttribute("data-door-always", ""); else el.removeAttribute("data-door-always");
    el.click();
  }, []);

  const color = here ? here.color : "#5fd3ee", branch = here ? here.branch : null;
  return (
    <div className="hx-page rm-page" data-testid="room-page">
      {cur === false || graph === false ? <p className="home-dim" style={{ padding: "2rem" }}>There is no room by that name. <Link to="/explore">Scan map</Link></p>
        : !here ? <Loading />
        : <BranchRoom tick={tick} world={here.world} color={color} next={next ? next.world : null} wantNext={wantNext} onAdvance={advance} go={go} mapHref="/explore" backHref={back} onLocked={noop} onProp={openTerm} onDrone={openDrone} visor={visor} lore={lore} onLogbook={openLog} onSite={openSite} onMilestone={openMs} paused={!!term || droneOpen || logOpen || !!site || !!card}ticker={branch?.channel?.slug ? <RoomTicker channel={branch.channel.slug} /> : null} />}
      {droneOpen && branch && <RoomTerminal title="drone // player" color={color} onClose={() => setDroneOpen(false)}><DroneTerminal onClose={() => setDroneOpen(false)} /></RoomTerminal>}
      {logOpen && branch && <RoomTerminal title="logbook" color={color} onClose={() => setLogOpen(false)}><SiteIndex sites={terminalSites(branch.slug, branch.name)} onOpen={openSite} /><LogbookTerminal lore={lore} /></RoomTerminal>}
      {site && branch && here && <PageTerminal path={site.path} title={site.title} color={color} ctx={{ room: branch.slug, albums: here.albums.map((a) => a.slug) }} onClose={() => setSite(null)} />}
      {card && branch && <RoomTerminal title={`${name} // milestone`} color={color} onClose={() => setCard(null)}><MilestoneView m={card} /></RoomTerminal>}
      {term && branch && here && (() => {
        const close = () => { setTerm(null); setPick(null); if (term.kind === "terminal" && branch.channel?.slug) void api<unknown>(`/api/channels/${branch.channel.slug}/messages?limit=3`).then((m) => { const l = previewLines(m); if (l.length) { here.world.chat = l; setTick((t) => t + 1); } }).catch(() => undefined); };
        if (term.kind === "terminal") return <RoomTerminal title={`${name} // talk`} color={color} onClose={close}><ChatTerminal slug={branch.channel?.slug ?? ""} name={name} /></RoomTerminal>;
        if (term.kind === "computer") return <RoomTerminal title={`${name} // site`} color={color} onClose={close}><SiteIndex sites={terminalSites(branch.slug, branch.name)} onOpen={openSite} /></RoomTerminal>;
        const slugOf = pick ?? (term.kind === "album" ? term.id.slice(2) : null);
        if (slugOf) return <RoomTerminal title={`${name} // disc`} color={color} onClose={close}><AlbumTerminal slug={slugOf} /></RoomTerminal>;
        return <RoomTerminal title={`${name} // all albums`} color={color} onClose={close}><ListTerminal albums={here.albums.map((a) => ({ slug: a.slug, title: a.title }))} onPick={setPick} /></RoomTerminal>;
      })()}
      <a ref={link} href="/" hidden aria-hidden="true" tabIndex={-1} onClick={(e) => { e.preventDefault(); navigate(e.currentTarget.getAttribute("href") ?? "/"); }} />
    </div>
  );
}
