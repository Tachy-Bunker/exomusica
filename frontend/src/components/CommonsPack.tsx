import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

interface Info { locked: boolean; month?: string; available?: number; ready?: boolean; building?: boolean; bytes?: number | null }
const POLL_MS = 4000, POLL_ROUNDS = 15;
const mb = (b: number): string => `${Math.max(1, Math.round(b / 1048576))} MB`;

/** Commons pack: this month's sample ZIP of tracks whose creators allow reuse. Rendered only once the milestone is reached; built on request, never in the background. */
export function CommonsPack() {
  const { user } = useAuth();
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState("");
  const timer = useRef<number | null>(null);
  const alive = useRef(true);

  const read = useCallback(async (): Promise<Info | null> => {
    try { const r = await api<Info>("/api/commons-pack"); if (alive.current) setInfo(r); return r; } catch { return null; }
  }, []);
  const poll = useCallback((round: number) => {
    timer.current = window.setTimeout(async () => {
      if (!alive.current) return;
      const r = await read();
      if (r && !r.ready && round < POLL_ROUNDS) poll(round + 1);
    }, POLL_MS);
  }, [read]);
  useEffect(() => {
    alive.current = true;
    void read().then((r) => { if (r?.building && !r.ready) poll(1); });
    return () => { alive.current = false; if (timer.current) window.clearTimeout(timer.current); };
  }, [read, poll]);

  async function build() {
    setErr("");
    try { await api("/api/commons-pack/build", { method: "POST" }); setInfo((i) => (i ? { ...i, building: true } : i)); poll(1); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't start it."); }
  }
  if (!info || info.locked) return null;
  return (
    <div className="commons-box" data-testid="commons-pack">
      <b>Commons pack · {info.month}</b>
      <span className="home-dim"> {info.available ?? 0} track{info.available === 1 ? "" : "s"} shared for reuse. A new draw of up to 40 each month, with a CREDITS file.</span>
      {info.ready ? <a className="btn" href="/api/commons-pack/download" download data-testid="commons-download">Download{info.bytes ? ` (${mb(info.bytes)})` : ""}</a>
        : info.building ? <span className="home-dim" data-testid="commons-building"> Packing… this takes a minute.</span>
        : (info.available ?? 0) === 0 ? null
        : user ? <button type="button" className="btn" onClick={() => void build()} data-testid="commons-build">Build this month's pack</button>
        : <span className="home-dim"> Log in to build it.</span>}
      {err && <span className="home-dim" role="alert"> {err}</span>}
    </div>
  );
}
