import { useEffect, useState } from "react";
import { loadMilestones, nextUp, pct, type Milestone } from "../lib/milestones";

/** One community milestone as a card: what it unlocks, how far the community is, and when it was reached. Small enough to sit inside a News post. */
export function MilestoneView({ m }: { m: Milestone }) {
  const when = m.reachedAt ? new Date(m.reachedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : null;
  return (
    <div className="milestone-card" data-testid="milestone-card" data-reached={m.reached ? "1" : "0"} data-key={m.key}>
      <div className="milestone-head">
        <b>{m.title}</b>
        {m.reached ? <span className="milestone-tag done">Reached{when ? ` ${when}` : ""}</span> : <span className="milestone-tag">{pct(m)}%</span>}
        {!m.live && <span className="milestone-tag soft" title="The number counts already; the reward is still being built">reward being built</span>}
      </div>
      <p className="home-dim" style={{ margin: "0.15rem 0 0.3rem", fontSize: "0.85rem" }}>{m.perk}</p>
      <div className="milestone-bar" role="progressbar" aria-valuemin={0} aria-valuemax={m.target} aria-valuenow={Math.min(m.now, m.target)} aria-label={`${m.title}: ${m.now} of ${m.target} ${m.label}`}>
        <i style={{ width: `${pct(m)}%` }} />
      </div>
      <span className="home-dim" style={{ fontSize: "0.8rem" }}>{Math.min(m.now, m.target).toLocaleString()} / {m.target.toLocaleString()} {m.label}</span>
    </div>
  );
}

/** @milestone(key) draws one card; @milestones draws the three closest to done. */
export function MilestoneEmbed({ id }: { id?: string }) {
  const [list, setList] = useState<Milestone[] | null>(null);
  useEffect(() => { let alive = true; loadMilestones().then((r) => alive && setList(r)).catch(() => alive && setList([])); return () => { alive = false; }; }, []);
  if (!list) return <div className="milestone-card home-dim">Loading…</div>;
  const shown = id ? list.filter((m) => m.key === id) : nextUp(list, 3);
  if (shown.length === 0) return <p className="home-dim" data-testid="milestone-none">{id ? "That milestone isn't active right now." : "Every milestone is reached."}</p>;
  return <div className="milestone-embed">{shown.map((m) => <MilestoneView key={m.key} m={m} />)}</div>;
}
