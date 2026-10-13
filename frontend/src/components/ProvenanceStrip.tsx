import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { branchHref } from "../lib/branchLinks";
import type { PlayableTrackDTO } from "../lib/types";

interface Prov {
  study: { slug: string; title: string } | null;
  sketch: { id: number; label: string; branchSlug: string } | null;
  branch: { slug: string; name: string };
  album: { slug: string; title: string };
}

const cache = new Map<number, Prov | null>();

/** Where this piece came from: study → sketch → branch → album. Each stage opens its place. Official tracks only. */
export function ProvenanceStrip({ track, onNavigate }: { track: PlayableTrackDTO; onNavigate?: () => void }) {
  const [p, setP] = useState<Prov | null>(track.source === "official" ? cache.get(track.id) ?? null : null);
  useEffect(() => {
    if (track.source !== "official" || track.id <= 0) { setP(null); return; }
    if (cache.has(track.id)) { setP(cache.get(track.id) ?? null); return; }
    let live = true;
    api<Prov>(`/api/tracks/${track.id}/provenance`).then((r) => { cache.set(track.id, r); if (live) setP(r); }).catch(() => { cache.set(track.id, null); });
    return () => { live = false; };
  }, [track.id, track.source]);
  if (!p || !p.branch || !p.album) return null;
  const stages: { key: string; label: string; to: string }[] = [];
  if (p.study) stages.push({ key: "study", label: p.study.title, to: `/study/${p.study.slug}` });
  if (p.sketch) stages.push({ key: "sketch", label: "sketch", to: branchHref(p.sketch.branchSlug) });
  stages.push({ key: "branch", label: p.branch.name, to: branchHref(p.branch.slug) });
  stages.push({ key: "album", label: p.album.title, to: `/album/${p.album.slug}` });
  if (stages.length < 3) return null; // only the branch and the album: nothing worth a strip
  return (
    <nav className="prov-strip" aria-label="Where this piece came from" data-testid="prov-strip" onClick={(e) => e.stopPropagation()}>
      {stages.map((s, i) => (
        <span key={s.key} className="prov-stage">
          {i > 0 && <span className="prov-arrow" aria-hidden>›</span>}
          <Link to={s.to} className={`prov-chip prov-${s.key}`} onClick={onNavigate} title={s.key}>{s.label}</Link>
        </span>
      ))}
    </nav>
  );
}
