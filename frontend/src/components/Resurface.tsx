import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { loadMilestones } from "../lib/milestones";
import { left, stormWorthAsking, type StormNow } from "../lib/storm";

interface Echo { text: string; by: string; channelName: string; at: number; href: string }
let echoOnce: Promise<Echo | null> | null = null;

/** Echo (a community milestone): one old message from a public chat, the same for everyone all day. Renders nothing until the milestone is reached. */
export function EchoCard() {
  const [echo, setEcho] = useState<Echo | null>(null);
  useEffect(() => {
    let on = true;
    echoOnce ??= api<{ echo: Echo | null }>("/api/echo").then((r) => r?.echo ?? null).catch(() => { echoOnce = null; return null; });
    void echoOnce.then((e) => on && setEcho(e));
    return () => { on = false; };
  }, []);
  if (!echo) return null;
  return (
    <section className="home-section echo-card" aria-labelledby="echo-h" data-testid="echo">
      <h2 id="echo-h" className="home-h2">Echo</h2>
      <blockquote><Link to={echo.href} data-testid="echo-link">{echo.text}</Link></blockquote>
      <p className="home-dim" style={{ fontSize: "0.85rem" }}>{echo.by} in {echo.channelName}, {new Date(echo.at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</p>
    </section>
  );
}

/** Signal storm banner (a community milestone): while the storm runs, and for a week after, one line on the homepage. Nothing is asked of the server before the milestone or long after it. */
export function StormBanner() {
  const [s, setS] = useState<StormNow | null>(null);
  useEffect(() => {
    let on = true;
    void loadMilestones().then(async (l) => {
      const m = l.find((x) => x.key === "m-storm");
      if (!on || !m?.reached || !stormWorthAsking(m.reachedAt, Date.now())) return;
      const r = await api<StormNow>("/api/storm"); if (on && r && !r.locked) setS(r);
    }).catch(() => undefined);
    return () => { on = false; };
  }, []);
  if (!s) return null;
  const pct = s.goal ? Math.min(100, Math.floor(((s.count ?? 0) / s.goal) * 100)) : 0;
  return (
    <section className="home-section" aria-label="Signal storm" data-testid="storm-banner">
      <Link to="/storm" className="home-h2" style={{ textDecoration: "none" }}>
        {s.state === "active" ? <>Signal storm · {pct}% · ends in {left((s.endsAt ?? 0) - (s.serverNow ?? 0))}</> : s.full ? <>Signal storm · the Artifact is open</> : <>Signal storm · over, the meter reached {pct}%</>}
      </Link>
    </section>
  );
}

interface Fragment { text: string; title: string; href: string }

/** Index (a community milestone): a passage from a random wiki page, and a button for another. The button appears only once the milestone is reached. */
export function RandomFragment() {
  const [open, setOpen] = useState(false);
  const [frag, setFrag] = useState<Fragment | null>(null);
  const [none, setNone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { let on = true; void loadMilestones().then((ms) => on && setOpen(ms.some((m) => m.key === "m-index" && m.reached))).catch(() => undefined); return () => { on = false; }; }, []);
  async function another() {
    setBusy(true); setNone(false);
    try { const r = await api<{ fragment: Fragment | null }>("/api/log/fragment"); setFrag(r?.fragment ?? null); setNone(!r?.fragment); }
    catch { setNone(true); } finally { setBusy(false); }
  }
  if (!open) return null;
  return (
    <section style={{ margin: "1rem 0" }} data-testid="fragment-box">
      <button type="button" className="btn" onClick={() => void another()} disabled={busy} data-testid="fragment-btn">{frag ? "Another fragment" : "Random fragment"}</button>
      {none && <p className="home-dim" role="status">Nothing to show yet.</p>}
      {frag && (
        <blockquote className="fragment" data-testid="fragment">
          <p>{frag.text}</p>
          <p className="home-dim" style={{ fontSize: "0.85rem" }}>from <Link to={frag.href} data-testid="fragment-link">{frag.title}</Link></p>
        </blockquote>
      )}
    </section>
  );
}
