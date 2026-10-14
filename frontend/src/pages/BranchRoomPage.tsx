import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { scannedIds } from "../lib/scanLog";
import { keysOf } from "../lib/fieldLog";
import { roomStates, type ChartBranch } from "../lib/chart";
import { hashStr } from "../lib/probeCore";
import { recordVisit, visitedSlugs } from "../lib/visits";
import { loadChartBranches } from "../lib/chartLoad";
import { loadHome, type HomeData } from "../lib/home";
import { loadMilestones } from "../lib/milestones";
import { layoutHull, type HullNode } from "../lib/hullLayout";
import { buildRoom } from "../lib/roomWorld";
import { themeOf } from "../lib/headerTheme";
import { neon } from "../lib/legibleColor";
import type { Branch, BranchAlbum } from "../lib/types";
import { BranchRoom } from "../components/BranchRoom";
import { Loading } from "../components/Loading";

/** /branch/:slug/room — the branch as a room you walk round. Doors lead the way the rooms lie on the Scan map. */
export function BranchRoomPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  return <RoomInner key={slug} slug={slug} />;
}

function RoomInner({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const from = sp.get("from");
  const [branch, setBranch] = useState<Branch | null | false>(null);
  const [albums, setAlbums] = useState<BranchAlbum[] | null>(null);
  const [list, setList] = useState<ChartBranch[] | null | false>(null);
  const [home, setHome] = useState<HomeData | null | false>(null);
  const [outer, setOuter] = useState<boolean | null>(null);
  const [color, setColor] = useState("#5fd3ee");
  const link = useRef<HTMLAnchorElement>(null);
  useDocumentTitle(branch ? `${branch.name} (room)` : "Room");

  const visited = useMemo(() => { const v = visitedSlugs(); for (const k of keysOf(scannedIds())) if (k.startsWith("branch:")) v.add(k.slice(7)); v.add(slug); return v; }, [slug]);
  const found = useMemo(() => new Set([...visited].map(hashStr)), [visited]);

  useEffect(() => {
    let alive = true;
    recordVisit(slug);
    api<Branch>(`/api/branches/${slug}`).then((b) => alive && setBranch(b && b.slug ? b : false)).catch(() => alive && setBranch(false));
    api<BranchAlbum[]>(`/api/branches/${slug}/albums`).then((a) => alive && setAlbums(a ?? [])).catch(() => alive && setAlbums([]));
    loadChartBranches(visited).then((n) => alive && setList(n)).catch(() => alive && setList(false));
    loadHome().then((h) => alive && setHome(h)).catch(() => alive && setHome(false));
    loadMilestones().then((l) => alive && setOuter(!!l.find((m) => m.key === "m-ring")?.reached)).catch(() => alive && setOuter(false));
    void themeOf(slug).then((t) => { if (alive && t) setColor(neon(t.color)); });
    return () => { alive = false; };
  }, [slug, visited]);

  const ready = branch !== null && albums !== null && list !== null && home !== null && outer !== null;
  const world = useMemo(() => {
    if (!ready || !branch) return null;
    const chart = list || [];
    const by = new Map((home ? home.branches : []).map((b) => [b.slug, b]));
    const nodes: HullNode[] = chart.map((b) => ({ id: b.id, parentId: b.parentId, slug: b.slug, name: b.name, secret: b.secret, key: b.key, tracks: by.get(b.slug)?.tracks ?? 0, albums: by.get(b.slug)?.albums ?? 0 }));
    const hull = chart.length ? layoutHull(nodes, { outer: !!outer }) : null;
    const states = chart.length ? roomStates(chart, visited, found) : null;
    return buildRoom({ hull, slug, name: branch.name, states, albums: (albums ?? []).map((a) => ({ slug: a.slug, title: a.title })), channelSlug: branch.channel?.slug ?? null, from });
  }, [ready, branch, albums, list, home, outer, visited, found, slug, from]);

  const back = `/branch/${slug}`;
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.code === "Escape" && !document.fullscreenElement) { e.stopPropagation(); navigate(back); } };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  }, [navigate, back]);

  const go = useCallback((to: string, door: boolean) => {
    const el = link.current; if (!el) return;
    el.setAttribute("href", to);
    if (door) el.setAttribute("data-door-always", ""); else el.removeAttribute("data-door-always");
    el.click();
  }, []);

  return (
    <div className="hx-page rm-page" data-testid="room-page">
      {branch === false ? <p className="home-dim" style={{ padding: "2rem" }}>There is no room by that name. <Link to="/explore">Scan map</Link></p>
        : !world || !branch ? <Loading />
        : <BranchRoom world={world} color={color} go={go} mapHref="/explore" backHref={back} onLocked={() => undefined} />}
      <a ref={link} href="/" hidden aria-hidden="true" tabIndex={-1} onClick={(e) => { e.preventDefault(); navigate(e.currentTarget.getAttribute("href") ?? "/"); }} />
    </div>
  );
}
