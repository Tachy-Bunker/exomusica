import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { scannedIds } from "../lib/scanLog";
import { keysOf } from "../lib/fieldLog";
import { roomStates, type ChartBranch } from "../lib/chart";
import { hashStr } from "../lib/probeCore";
import { readLastPlay, visitedSlugs } from "../lib/visits";
import { loadChartBranches } from "../lib/chartLoad";
import { loadHome, type HomeData } from "../lib/home";
import { loadMilestones } from "../lib/milestones";
import { layoutHull, type HullNode, type MapOverride } from "../lib/hullLayout";
import { loadMapOverrides } from "../lib/mapOverrides";
import { useAudioStore } from "../lib/audioStore";
import { BranchExplorer } from "../components/BranchExplorer";
import { Loading } from "../components/Loading";

/** Off for now (the 2D Chart still shows them): rooms others looked at this week as a wash on the roof. */
const SHOW_PULSES = false;

/** The branch explorer, full screen: the Chart's rooms (and what you know of them) as a wireframe world you can turn, zoom and move through. */
export function ExplorePage() {
  useDocumentTitle("Scan map");
  const navigate = useNavigate();
  const [list, setList] = useState<ChartBranch[] | null>(null);
  const [home, setHome] = useState<HomeData | null>(null);
  const [failed, setFailed] = useState(false);
  const [outer, setOuter] = useState(false);
  const [pulses, setPulses] = useState<Record<string, number>>({});
  const visited = useMemo(() => { const v = visitedSlugs(); for (const k of keysOf(scannedIds())) if (k.startsWith("branch:")) v.add(k.slice(7)); return v; }, []);
  const found = useMemo(() => new Set([...visited].map(hashStr)), [visited]);
  const last = useMemo(readLastPlay, []);
  const playingSlug = useAudioStore((s) => (s.isPlaying ? s.currentTrack?.branchSlug ?? null : null));

  useEffect(() => {
    let alive = true;
    loadChartBranches(visited).then((n) => alive && setList(n)).catch(() => alive && setFailed(true));
    loadHome().then((h) => alive && setHome(h)).catch(() => undefined); // sizes only: the map still works without them
    loadMilestones().then(async (l) => {
      if (!alive) return;
      setOuter(!!l.find((m) => m.key === "m-ring")?.reached); // Second ring: sealed rooms get an outer ring
      if (SHOW_PULSES && l.find((m) => m.key === "m-chart")?.reached) { // Chart layer: rooms others looked at this week
        const r = await api<{ locked: boolean; pulses: Record<string, number> }>("/api/chart/pulse").catch(() => null);
        if (alive && r && !r.locked) setPulses(r.pulses ?? {});
      }
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [visited]);

  const exit = () => { if ((window.history.state?.idx ?? 0) > 0) navigate(-1); else navigate("/soundbay"); };
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.fullscreenElement) exit(); };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const [ovr, setOvr] = useState<MapOverride[]>([]);
  useEffect(() => { let on = true; loadMapOverrides().then((r) => { if (on) setOvr(r); }); return () => { on = false; }; }, []);
  const hull = useMemo(() => {
    if (!list) return null;
    const by = new Map((home?.branches ?? []).map((b) => [b.slug, b]));
    const nodes: HullNode[] = list.map((b) => ({ id: b.id, parentId: b.parentId, slug: b.slug, name: b.name, secret: b.secret, key: b.key, tracks: by.get(b.slug)?.tracks ?? 0, albums: by.get(b.slug)?.albums ?? 0 }));
    return layoutHull(nodes, { outer, overrides: ovr });
  }, [list, home, outer, ovr]);
  const states = useMemo(() => (list ? roomStates(list, visited, found) : null), [list, visited, found]);

  return (
    <div className="hx-page" data-testid="explore-page">
      {failed ? <p className="home-dim" style={{ padding: "2rem" }}>The map could not be read. <button type="button" className="btn" onClick={exit}>Back</button></p>
        : !hull || !states ? <Loading />
        : hull.rooms.length === 0 ? <p className="home-dim" style={{ padding: "2rem" }}>Nothing to map yet. <button type="button" className="btn" onClick={exit}>Back</button></p>
        : <BranchExplorer hull={hull} states={states} lastSlug={last?.branchSlug ?? null} playingSlug={playingSlug} pulses={pulses} onExit={exit} />}
    </div>
  );
}
