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
import { loadMilestones } from "../lib/milestones";
import { layoutHull, type Hull, type HullNode } from "../lib/hullLayout";
import { buildRoom, type RoomWorld } from "../lib/roomWorld";
import { themeOf } from "../lib/headerTheme";
import { neon } from "../lib/legibleColor";
import type { Branch, BranchAlbum } from "../lib/types";
import { BranchRoom } from "../components/BranchRoom";
import { AlbumTerminal, ChatTerminal, DroneTerminal, ListTerminal, LogbookTerminal, RoomTerminal } from "../components/RoomTerminal";
import type { Lore } from "../lib/roomLore";
import type { RoomProp } from "../lib/roomWorld";
import { previewLines } from "../lib/roomPreview";
import { Loading } from "../components/Loading";

const noop = (): void => undefined;

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
  const [lore, setLore] = useState<Map<string, Lore> | null>(null), [visor, setVisor] = useState({ on: false, hint: "The echo visor is not unlocked yet." });
  const openTerm = useCallback((p: RoomProp) => { setPick(null); setDroneOpen(false); setLogOpen(false); setTerm(p); }, []);
  const openDrone = useCallback(() => { setTerm(null); setPick(null); setLogOpen(false); setDroneOpen(true); }, []);
  const openLog = useCallback(() => { setTerm(null); setPick(null); setDroneOpen(false); setLogOpen(true); }, []);
  useDocumentTitle(cur ? `${cur.branch.name} (room)` : "Room");

  const visited = useRef<Set<string>>(null as unknown as Set<string>);
  if (!visited.current) { const v = visitedSlugs(); for (const k of keysOf(scannedIds())) if (k.startsWith("branch:")) v.add(k.slice(7)); v.add(slug); visited.current = v; }
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
    const world = buildRoom({ hull: g.hull, slug: s, name: branch.name, states, albums: (albums ?? []).map((a) => ({ slug: a.slug, title: a.title })), channelSlug: branch.channel?.slug ?? null, from: via });
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
    Promise.all([loadChartBranches(visited.current).catch(() => null), loadHome().catch(() => null), loadMilestones().then((l) => !!l.find((m) => m.key === "m-ring")?.reached).catch(() => false)]).then(async ([chart, home, outer]) => {
      if (!alive.current) return;
      const by = new Map((home ? home.branches : []).map((b) => [b.slug, b]));
      const nodes: HullNode[] = (chart || []).map((b) => ({ id: b.id, parentId: b.parentId, slug: b.slug, name: b.name, secret: b.secret, key: b.key, tracks: by.get(b.slug)?.tracks ?? 0, albums: by.get(b.slug)?.albums ?? 0 }));
      const g: Graph = { chart: chart || [], hull: nodes.length ? layoutHull(nodes, { outer }) : null, outer };
      graphRef.current = g; setGraph(g);
      const d = await loadRoom(slug, from);
      if (alive.current) setCur(d);
    });
  }, [slug, from, loadRoom]);

  /** The room behind the door you are near (null: none). Only one is kept; asking for another drops it. */
  const wantNext = useCallback((s: string | null) => {
    if (s === null) { wantRef.current = null; nextRef.current = null; setNext(null); return; }
    if (wantRef.current === s) return;
    wantRef.current = s; if (nextRef.current && nextRef.current.slug !== s) { nextRef.current = null; setNext(null); }
    void loadRoom(s, curSlug.current).then((d) => { if (alive.current && d && wantRef.current === s) { nextRef.current = d; setNext(d); } });
  }, [loadRoom]);

  /** You walked through into the room that was waiting: it becomes the room you are in, the address follows, and the one behind you is let go. */
  const advance = useCallback((s: string) => {
    const n = nextRef.current; curSlug.current = s; visited.current.add(s); recordVisit(s);
    try { window.history.replaceState(window.history.state, "", `/branch/${s}/room`); } catch { /* sandboxed frame */ }
    setTerm(null); setPick(null); setDroneOpen(false); setLogOpen(false);
    nextRef.current = null; wantRef.current = null; setNext(null);
    if (n && n.slug === s) setCur(n); else void loadRoom(s, null).then((d) => { if (alive.current && d) setCur(d); });
  }, [loadRoom]);

  const here = cur || null, name = here ? here.branch.name : "";
  const back = `/branch/${here ? here.slug : slug}`;
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.code === "Escape" && !document.fullscreenElement) { e.stopPropagation(); if (term || droneOpen || logOpen) { setTerm(null); setPick(null); setDroneOpen(false); setLogOpen(false); } else navigate("/explore"); } };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  }, [navigate, back, term, droneOpen, logOpen]);

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
        : <BranchRoom tick={tick} world={here.world} color={color} next={next ? next.world : null} wantNext={wantNext} onAdvance={advance} go={go} mapHref="/explore" backHref={back} onLocked={noop} onProp={openTerm} onDrone={openDrone} visor={visor} lore={lore} onLogbook={openLog} paused={!!term || droneOpen || logOpen} />}
      {droneOpen && branch && <RoomTerminal title="drone // player" color={color} onClose={() => setDroneOpen(false)}><DroneTerminal onClose={() => setDroneOpen(false)} /></RoomTerminal>}
      {logOpen && branch && <RoomTerminal title="logbook" color={color} onClose={() => setLogOpen(false)}><LogbookTerminal lore={lore} /></RoomTerminal>}
      {term && branch && here && (() => {
        const close = () => { setTerm(null); setPick(null); if (term.kind === "terminal" && branch.channel?.slug) void api<unknown>(`/api/channels/${branch.channel.slug}/messages?limit=3`).then((m) => { const l = previewLines(m); if (l.length) { here.world.chat = l; setTick((t) => t + 1); } }).catch(() => undefined); };
        if (term.kind === "terminal") return <RoomTerminal title={`${name} // talk`} color={color} onClose={close}><ChatTerminal slug={branch.channel?.slug ?? ""} name={name} /></RoomTerminal>;
        const slugOf = pick ?? (term.kind === "album" ? term.id.slice(2) : null);
        if (slugOf) return <RoomTerminal title={`${name} // disc`} color={color} onClose={close}><AlbumTerminal slug={slugOf} /></RoomTerminal>;
        return <RoomTerminal title={`${name} // all albums`} color={color} onClose={close}><ListTerminal albums={here.albums.map((a) => ({ slug: a.slug, title: a.title }))} onPick={setPick} /></RoomTerminal>;
      })()}
      <a ref={link} href="/" hidden aria-hidden="true" tabIndex={-1} onClick={(e) => { e.preventDefault(); navigate(e.currentTarget.getAttribute("href") ?? "/"); }} />
    </div>
  );
}
