import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { scannedIds } from "../lib/scanLog";
import { keysOf } from "../lib/fieldLog";
import { chartTally, layoutChart, roomStates, type ChartBranch } from "../lib/chart";
import { readLastPlay, visitedSlugs } from "../lib/visits";
import { listDrafts } from "../lib/studyDraft";

const CW = 180, RH = 74, W = 132, H = 44, PAD = 24;

/** The branches as a floor plan. Rooms you have been to are filled, rooms next to them are outlined, the rest are dark. One SVG, drawn once. */
export function ChartPage() {
  useDocumentTitle("Chart");
  const [list, setList] = useState<ChartBranch[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { api<(ChartBranch & { visibility?: string })[]>("/api/branches").then((d) => (Array.isArray(d) ? setList(d.filter((b) => b.visibility !== "HIDDEN").map((b) => ({ id: b.id, slug: b.slug, name: b.name, parentId: b.parentId }))) : setFailed(true))).catch(() => setFailed(true)); }, []);
  const visited = useMemo(() => { const v = visitedSlugs(); for (const k of keysOf(scannedIds())) if (k.startsWith("branch:")) v.add(k.slice(7)); return v; }, []);
  const last = useMemo(readLastPlay, []);
  const drafts = useMemo(listDrafts, []);
  const plan = useMemo(() => (list ? layoutChart(list) : null), [list]);
  const states = useMemo(() => (list ? roomStates(list, visited) : null), [list, visited]);
  if (failed) return <p className="home-dim">The chart could not be read.</p>;
  if (!list || !plan || !states) return <p className="home-dim">Loading…</p>;
  const tally = chartTally(states);
  const pos = new Map(plan.rooms.map((r) => [r.id, { x: PAD + r.col * CW, y: PAD + r.row * RH }]));
  const svgW = PAD * 2 + plan.cols * CW - (CW - W), svgH = PAD * 2 + Math.max(plan.rows - 1, 0) * RH + H;
  return (
    <div className="chart-page" data-testid="chart-page">
      <h1>Chart</h1>
      <p className="home-dim">Filled: you have been there. Outlined: heard of. Dark: not yet. <span data-testid="chart-tally">{tally.visited} visited · {tally.heard} heard of · {tally.unseen} unseen</span> · <Link to="/field-log">Field Log</Link></p>
      {(last || drafts.length > 0) && (
        <div className="chart-continue" data-testid="chart-continue">
          {last && <p><b>Last heard:</b> <Link to={`/branch/${last.branchSlug}`} data-testid="chart-last">{last.title || last.branchSlug}</Link></p>}
          {drafts.map((d) => <p key={d.slug}><b>Draft:</b> <Link to={`/study/${d.slug}`} data-testid="chart-draft">{d.title}</Link></p>)}
        </div>
      )}
      <div className="chart-scroll">
        <svg width={svgW} height={svgH} role="img" aria-label="Floor plan of the branches" data-testid="chart-svg">
          {plan.rooms.map((r) => {
            if (r.parentId == null || !pos.has(r.parentId)) return null;
            const a = pos.get(r.parentId)!, b = pos.get(r.id)!, mx = a.x + W + (CW - W) / 2;
            return <path key={"e" + r.id} className="chart-corridor" d={`M${a.x + W},${a.y + H / 2}H${mx}V${b.y + H / 2}H${b.x}`} />;
          })}
          {plan.rooms.map((r) => {
            const p = pos.get(r.id)!, st = states.get(r.id)!;
            const body = (
              <g className={`chart-room ${st}`} data-testid={`room-${st}`} transform={`translate(${p.x},${p.y})`}>
                <rect width={W} height={H} rx={4} />
                <text x={W / 2} y={H / 2 + 5} textAnchor="middle">{st === "unseen" ? "???" : r.name.length > 17 ? r.name.slice(0, 16) + "…" : r.name}</text>
                {last?.branchSlug === r.slug && <circle className="chart-pin" cx={W - 8} cy={8} r={5} data-testid="chart-pin"><title>Last heard here</title></circle>}
              </g>
            );
            return st === "unseen" ? <g key={r.id}>{body}</g> : <a key={r.id} href={`/branch/${r.slug}`} aria-label={r.name}>{body}</a>;
          })}
        </svg>
      </div>
    </div>
  );
}
