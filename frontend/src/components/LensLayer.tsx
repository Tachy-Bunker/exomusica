import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { buildHeatMap, buildScanHeat, pathOfHref, type Heat } from "../lib/heat";
import { loadMilestones } from "../lib/milestones";
import { useProbeStore, type Lens } from "../lib/probeStore";

const KEYS: Record<string, Lens> = { Digit1: "normal", Digit2: "thermal", Digit3: "xray", Numpad1: "normal", Numpad2: "thermal", Numpad3: "xray" };
export const LENSES: { id: Lens; label: string; key: string; tip: string }[] = [
  { id: "normal", label: "Normal", key: "1", tip: "Read the page as it is" },
  { id: "thermal", label: "Thermal", key: "2", tip: "Warm = recent activity, cold = quiet" },
  { id: "xray", label: "X-ray", key: "3", tip: "Show the structure and what links here" },
];

/** The lens chips in the Probe bar, and keys 1-3 to switch. */
export function LensChips() {
  const lens = useProbeStore((s) => s.lens);
  const setLens = useProbeStore((s) => s.setLens);
  return (
    <span className="lens-chips" role="group" aria-label="Lens">
      {LENSES.map((l) => <button key={l.id} type="button" className="btn" aria-pressed={lens === l.id} title={`${l.tip} (${l.key})`} onClick={() => setLens(l.id)} data-testid={`lens-${l.id}`}>{l.label}</button>)}
    </span>
  );
}

let heatCache: { at: number; map: Map<string, Heat> } | null = null;
async function loadHeat(): Promise<Map<string, Heat>> {
  if (heatCache && Date.now() - heatCache.at < 120_000) return heatCache.map;
  const [b, c, s] = await Promise.all([
    api<unknown[]>("/api/branches").catch(() => []), api<unknown[]>("/api/channels").catch(() => []), api<unknown[]>("/api/studies").catch(() => []),
  ]);
  const arr = <T,>(x: unknown) => (Array.isArray(x) ? (x as T[]) : []);
  heatCache = { at: Date.now(), map: buildHeatMap(arr(b), arr(c), arr(s), Date.now() / 1000) };
  return heatCache.map;
}

let scanHeatCache: { at: number; p: Promise<Map<string, Heat> | null> } | null = null;
/** The community-scan reading, or null while the milestone is still ahead. */
function loadScanHeat(): Promise<Map<string, Heat> | null> {
  if (scanHeatCache && Date.now() - scanHeatCache.at < 300_000) return scanHeatCache.p;
  const p = loadMilestones().then((ms) => (ms.some((m) => m.key === "m-thermal" && m.reached) ? api<{ rows: [string, number][] }>("/api/scans/heat").then((r) => buildScanHeat(Array.isArray(r?.rows) ? r.rows : [])) : null)).catch(() => null);
  scanHeatCache = { at: Date.now(), p };
  return p;
}

/** Marks every link whose page has a known last-activity time with data-heat 0-4. Runs once, then again (debounced) when the page's content changes, and only while the lens is on. */
function Thermal() {
  const [mode, setMode] = useState<"recent" | "scanned">("recent");
  const [hasScanned, setHasScanned] = useState(false);
  useEffect(() => { let on = true; void loadMilestones().then((ms) => on && setHasScanned(ms.some((m) => m.key === "m-thermal" && m.reached))).catch(() => undefined); return () => { on = false; }; }, []);
  useEffect(() => {
    document.body.classList.add("lens-thermal");
    let map: Map<string, Heat> | null = null, timer = 0, dead = false;
    const paint = () => {
      if (!map) return;
      for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        const p = pathOfHref(a.getAttribute("href") ?? "", location.origin);
        const h = p ? map.get(p) : undefined;
        if (h === undefined) { if (a.dataset.heat !== undefined) delete a.dataset.heat; } else if (a.dataset.heat !== String(h)) a.dataset.heat = String(h);
      }
    };
    const later = () => { window.clearTimeout(timer); timer = window.setTimeout(paint, 250); };
    void (mode === "scanned" ? loadScanHeat().then((m) => m ?? loadHeat()) : loadHeat()).then((m) => { if (dead) return; map = m; paint(); });
    const mo = new MutationObserver(later); mo.observe(document.body, { childList: true, subtree: true });
    return () => { dead = true; window.clearTimeout(timer); mo.disconnect(); document.body.classList.remove("lens-thermal"); document.querySelectorAll("[data-heat]").forEach((e) => delete (e as HTMLElement).dataset.heat); };
  }, [mode]);
  return (
    <div className="lens-legend probe-ui" data-testid="heat-legend" data-mode={mode}>
      {hasScanned && (
        <span role="group" aria-label="Thermal reading" style={{ order: -1, display: "inline-flex", gap: "0.2rem" }}>
          <button type="button" className="btn" aria-pressed={mode === "recent"} onClick={() => setMode("recent")} data-testid="heat-recent" title="Warm = recent activity">Recent</button>
          <button type="button" className="btn" aria-pressed={mode === "scanned"} onClick={() => setMode("scanned")} data-testid="heat-scanned" title="Warm = scanned by many members">Scanned</button>
        </span>
      )}
      <i aria-hidden="true" /> <span aria-hidden="true">cold</span><span aria-hidden="true">warm</span>
    </div>
  );
}

interface Hit { type: string; slug: string; title: string; href: string }
const traceable = /^\/(branch|album|study|wiki|news|u|topic|collaborator|playlist|community-album)\/[^/]+$/;
const backCache = new Map<string, Hit[]>();

/** Outlines the page's structure and lists what links to it. */
function Xray() {
  const { pathname } = useLocation();
  const [hits, setHits] = useState<Hit[] | null>(null);
  const can = traceable.test(pathname);
  useEffect(() => { document.body.classList.add("lens-xray"); return () => document.body.classList.remove("lens-xray"); }, []);
  useEffect(() => {
    if (!can) { setHits(null); return; }
    const cached = backCache.get(pathname);
    if (cached) { setHits(cached); return; }
    setHits(null);
    let dead = false;
    api<Hit[]>(`/api/backlinks?path=${encodeURIComponent(pathname)}`).then((h) => { const list = Array.isArray(h) ? h : []; backCache.set(pathname, list); if (!dead) setHits(list); }).catch(() => { if (!dead) setHits([]); });
    return () => { dead = true; };
  }, [pathname, can]);
  return (
    <aside className="xray-panel probe-ui" aria-label="X-ray: what links here" data-testid="xray-panel">
      <b>X-RAY</b>
      {!can ? <p>Nothing to trace here. X-ray reads branch, album, study, wiki, news, topic and profile pages.</p>
        : hits === null ? <p>Tracing…</p>
        : hits.length === 0 ? <p data-testid="xray-none">Nothing links to this page yet.</p>
        : <><p>Linked from {hits.length}:</p><ul>{hits.map((h) => <li key={h.href}><Link to={h.href} data-testid="xray-hit"><small>{h.type}</small> {h.title}</Link></li>)}</ul></>}
    </aside>
  );
}

/** Mounted only while Probe is on. */
export function LensLayer() {
  const lens = useProbeStore((s) => s.lens);
  const setLens = useProbeStore((s) => s.setLens);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null, next = KEYS[e.code];
      if (!next || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      setLens(next);
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [setLens]);
  return lens === "thermal" ? <Thermal /> : lens === "xray" ? <Xray /> : null;
}
