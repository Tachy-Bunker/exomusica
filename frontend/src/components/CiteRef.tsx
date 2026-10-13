import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export interface Cite { url: string | null; citedBy: { slug: string; title: string }[] }
interface Preview { title: string; description: string | null; image: string | null }
const previews = new Map<string, Preview | null>();

/** [n] in a study: pointing at it (or focusing it) opens a small card with the source, a peek at the page, and the other studies citing it. Pure CSS to show; the page peek loads on first hover. */
export function CiteRef({ n, text, cite, children }: { n: number; text: ReactNode; cite?: Cite; children?: ReactNode }) {
  const url = cite?.url ?? null;
  const [got, setPv] = useState<Preview | null | undefined>(undefined);
  const pv = got ?? (url ? previews.get(url) : null) ?? null; // the cites arrive after the first render, so the url can change under us
  function load() {
    if (!url || previews.has(url)) return;
    previews.set(url, null);
    api<Preview>(`/api/link-preview?url=${encodeURIComponent(url)}`).then((r) => { previews.set(url, r); setPv(r); }).catch(() => setPv(null));
  }
  const host = url ? (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } })() : null;
  return (
    <sup className="footnote-ref cite" onMouseEnter={load} onFocus={load}>
      <a
        href={`#note-${n}`}
        onClick={(e) => { e.preventDefault(); document.getElementById(`note-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
      >
        [{n}]
      </a>
      <span className="cite-card" role="tooltip" data-testid="cite-card">
        <span className="cite-text">{text}</span>
        {url && (
          <a className="cite-src" href={url} target="_blank" rel="noreferrer">
            {pv?.image && <img src={pv.image} alt="" loading="lazy" />}
            <b>{pv?.title && pv.title !== host ? pv.title : host}</b>
            {pv?.description && <span className="cite-desc">{pv.description}</span>}
            <span className="cite-host">{host}</span>
          </a>
        )}
        {cite && cite.citedBy.length > 0 && (
          <span className="cite-by">Also cited in: {cite.citedBy.slice(0, 4).map((s, i) => <span key={s.slug}>{i > 0 && ", "}<Link to={`/study/${s.slug}`}>{s.title}</Link></span>)}{cite.citedBy.length > 4 ? ` +${cite.citedBy.length - 4}` : ""}</span>
        )}
      </span>
      {children}
    </sup>
  );
}
