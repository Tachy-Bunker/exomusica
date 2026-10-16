import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { Loading } from "../components/Loading";

interface Boss { source: "written" | "temporary"; title: string; brief: string; rule: string; trackId: number | null; trackTitle: string | null; goalUnits: number; downAt: string | null }
interface MonthlyPublic { open: boolean; month: string; openMonth: string | null; boss: Boss | null; bar: { units: number; goal: number; listen: number; run: number; down: boolean } | null }
interface Mine { listenMinutes: number; runUnits: number; ranToday: boolean }

/** The monthly boss (milestone m-monthly): one brief a month, and one shared bar. Listening and room runs both fill it. */
export function MonthlyPage() {
  useDocumentTitle("Monthly challenge");
  const { user } = useAuth();
  const [data, setData] = useState<MonthlyPublic | null>(null);
  const [mine, setMine] = useState<Mine | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { api<MonthlyPublic>("/api/monthly").then(setData).catch(() => setFailed(true)); }, []);
  useEffect(() => {
    if (!user) { setMine(null); return; }
    api<Mine>("/api/monthly/mine").then(setMine).catch(() => setMine(null));
  }, [user?.id]);

  if (!data) return failed ? <p role="alert">Couldn't load the challenge.</p> : <Loading />;
  if (!data.open) return <section data-testid="monthly-closed"><h1>Monthly challenge</h1><p>It opens when the community reaches its milestone. Until then there is no brief to read.</p></section>;
  if (!data.boss || !data.bar) return <section data-testid="monthly-none"><h1>Monthly challenge</h1><p>No brief for this month yet. The next one is being written.</p></section>;

  const { boss, bar } = data;
  const pct = Math.min(100, Math.round((bar.units / bar.goal) * 100));
  const downOn = boss.downAt ? new Date(boss.downAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null;

  return (
    <section data-testid="monthly">
      <h1>{boss.title}</h1>
      {boss.source === "temporary" && <p className="home-dim" data-testid="monthly-temporary">A temporary brief, until this month's is written.</p>}
      <p>{boss.brief}</p>
      {boss.rule && <p className="home-dim"><b>Rule.</b> {boss.rule}</p>}
      {boss.trackTitle
        ? <p>The boss is <b>{boss.trackTitle}</b>. Listening to it fills the bar, a minute at a time.</p>
        : <p className="home-dim">The boss track isn't set yet, so listening can't count this month. Room runs still do.</p>}
      <div role="progressbar" aria-label="Shared progress" aria-valuemin={0} aria-valuemax={bar.goal} aria-valuenow={Math.min(bar.units, bar.goal)} aria-valuetext={`${bar.units} of ${bar.goal} units`} className="monthly-bar">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p data-testid="monthly-bar-text">
        {bar.down
          ? `Down. The community filled the bar${downOn ? ` on ${downOn}` : ""}.`
          : `${bar.units.toLocaleString()} of ${bar.goal.toLocaleString()} units. Listening ${bar.listen.toLocaleString()}, room runs ${bar.run.toLocaleString()}.`}
      </p>
      <p className="home-dim">One unit is a minute of listening to the boss track. A room boss beaten is five units, once per member per day.</p>
      {user && mine && (
        <p data-testid="monthly-mine">You: {mine.listenMinutes.toLocaleString()} minutes of listening, {Math.floor(mine.runUnits / 5)} room {Math.floor(mine.runUnits / 5) === 1 ? "run" : "runs"}. Today's run {mine.ranToday ? "is counted." : "isn't counted yet."}</p>
      )}
      <p className="home-dim">If the bar isn't full when the month ends, the boss is still standing. Nothing is lost.</p>
    </section>
  );
}
