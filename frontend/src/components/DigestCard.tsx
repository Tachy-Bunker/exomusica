import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { awayLabel, markVisit, readLastVisit, worthShowing, type Digest } from "../lib/digest";

/** On Home, after being away a while: one compact card of what happened. The visit is stamped when the card is closed or the page is left, so a reload doesn't swallow it. */
export function DigestCard() {
  const [d, setD] = useState<Digest | null>(null);
  const [last] = useState(() => readLastVisit());
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    const stamp = () => markVisit();
    window.addEventListener("pagehide", stamp);
    if (last == null) markVisit(); // first visit on this device: nothing to compare with yet
    else if (Date.now() - last > 6 * 3_600_000) api<Digest>(`/api/digest?since=${last}`).then(setD).catch(() => undefined);
    else markVisit();
    return () => window.removeEventListener("pagehide", stamp);
  }, [last]);
  if (closed || !worthShowing(last, d)) return null;
  const x = d!;
  const close = () => { markVisit(); setClosed(true); };
  return (
    <aside className="digest" data-testid="digest-card" aria-label="Since you were last here">
      <div className="digest-head"><b>Since you left {last ? `(${awayLabel(Date.now() - last)} ago)` : ""}</b><button type="button" className="btn" onClick={close} aria-label="Dismiss" data-testid="digest-close">✕</button></div>
      <ul>
        {x.replies.count > 0 && <li><b>{x.replies.count} {x.replies.count === 1 ? "reply" : "replies"} to you</b>{x.replies.items.map((r, i) => <span key={i} className="digest-sub"> · <Link to={r.href}>{r.by}: {r.text}</Link></span>)}</li>}
        {x.topics.length > 0 && <li>New in what you follow: {x.topics.map((t, i) => <span key={t.href}>{i > 0 && ", "}<Link to={t.href}>{t.name}</Link> ({t.count})</span>)}</li>}
        {x.albums.length > 0 && <li>New albums: {x.albums.map((a, i) => <span key={a.slug}>{i > 0 && ", "}<Link to={`/album/${a.slug}`}>{a.title}</Link></span>)}</li>}
        {x.studies.length > 0 && <li>Study updates: {x.studies.map((s, i) => <span key={s.slug}>{i > 0 && ", "}<Link to={`/study/${s.slug}`}>{s.title}</Link></span>)}</li>}
      </ul>
    </aside>
  );
}
