import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

interface Glance { bio: string | null; study: { slug: string; title: string; status: "IN_PROGRESS" | "COMPLETE" } | null; track: { title: string; albumSlug: string; albumTitle: string } | null }
const cache = new Map<string, Glance | null>();

/** @name in chat: pointing at it shows what they are working on (latest study, latest track). Loads on first hover, once per name. */
export function MentionGlance({ username, onOpen }: { username: string; onOpen?: (path: string) => void }) {
  const [g, setG] = useState<Glance | null | undefined>(cache.get(username));
  function load() {
    if (cache.has(username)) { setG(cache.get(username)); return; }
    cache.set(username, null);
    api<Glance>(`/api/users/${encodeURIComponent(username)}/glance`).then((r) => { cache.set(username, r); setG(r); }).catch(() => undefined);
  }
  const empty = g && !g.study && !g.track && !g.bio;
  return (
    <span className="mention glance" style={{ cursor: "pointer" }} tabIndex={0} onMouseEnter={load} onFocus={load}
      onClick={(e) => { e.preventDefault(); onOpen?.(`/u/${username}`); }} data-testid="mention">
      @{username}
      <span className="glance-card" role="tooltip" data-testid="glance-card">
        <b>{username}</b>
        {!g && <span className="home-dim">…</span>}
        {g?.bio && <span className="home-dim">{g.bio}</span>}
        {g?.study && <span>{g.study.status === "IN_PROGRESS" ? "Working on" : "Finished"}: <Link to={`/study/${g.study.slug}`}>{g.study.title}</Link></span>}
        {g?.track && <span>Latest track: <Link to={`/community-album/${g.track.albumSlug}`}>{g.track.title}</Link></span>}
        {empty && <span className="home-dim">Nothing public yet.</span>}
      </span>
    </span>
  );
}
