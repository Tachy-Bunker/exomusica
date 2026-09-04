import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { renderMarkdown } from "../lib/markdown";
import { useCustomFont, type FontInfo } from "../lib/useCustomFont";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useContentScaleStore } from "../lib/contentScaleStore";
import { BranchIndexList } from "../components/BranchIndexList";

interface WikiSummary {
  id: number;
  slug: string;
  title: string;
  parentId: number | null;
}

interface WikiFull extends WikiSummary {
  contentMarkdown: string;
  font: FontInfo | null;
}

export function WikiPage() {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const scale = useContentScaleStore((s) => (isDesktop ? s.desktop : s.mobile));
  const [pages, setPages] = useState<WikiSummary[]>([]);
  const [current, setCurrent] = useState<WikiFull | null>(null);
  const fontFamily = useCustomFont(current?.font);

  useEffect(() => {
    api<WikiSummary[]>("/api/wiki").then(setPages);
  }, []);

  useEffect(() => {
    if (slug) return;
    api<{ defaultWikiPage: { slug: string } | null }>("/api/site-settings").then((s) => {
      if (s.defaultWikiPage) navigate(`/wiki/${s.defaultWikiPage.slug}`, { replace: true });
    });
  }, [slug, navigate]);

  useEffect(() => {
    if (!slug) {
      setCurrent(null);
      return;
    }
    api<WikiFull>(`/api/wiki/${slug}`).then(setCurrent);
  }, [slug]);

  const pagesNav = (
    <nav>
      <h3 style={{ fontSize: `${0.9 * scale}rem` }}>Pages</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {pages
          .filter((p) => !p.parentId)
          .map((p) => (
            <li key={p.id} style={{ marginBottom: "0.3rem" }}>
              <Link to={`/wiki/${p.slug}`}>{p.title}</Link>
              <ul style={{ listStyle: "none", paddingLeft: "0.8rem" }}>
                {pages
                  .filter((c) => c.parentId === p.id)
                  .map((c) => (
                    <li key={c.id}>
                      <Link to={`/wiki/${c.slug}`}>{c.title}</Link>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
      </ul>
    </nav>
  );

  const article = (
    <div style={{ fontFamily }}>
      {!slug && <p style={{ color: "var(--text-dim)" }}>Pick a page from the list.</p>}
      {slug && !current && <p>Loading…</p>}
      {current &&
        (current.contentMarkdown.trim() === "@branch-index" ? <BranchIndexList /> : renderMarkdown(current.contentMarkdown, navigate))}
    </div>
  );

  if (!isDesktop) {
    // Single column — the article first, Pages menu after a separator at the
    // end, not a sidebar (there's no horizontal room for one on mobile).
    return (
      <div style={{ fontSize: `${scale}rem` }}>
        {article}
        <hr style={{ margin: "2rem 0", border: "none", borderTop: "1px solid var(--border)" }} />
        {pagesNav}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "2rem", fontSize: `${scale}rem` }}>
      {pagesNav}
      {article}
    </div>
  );
}
