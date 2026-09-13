import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { renderMarkdown } from "../lib/markdown";
import { useCustomFont, type FontInfo } from "../lib/useCustomFont";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useContentScaleStore } from "../lib/contentScaleStore";
import { BranchIndexList } from "../components/BranchIndexList";
import { CollaboratorIndexList } from "../components/CollaboratorIndexList";
import { isTypingTarget } from "../lib/isTypingTarget";

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

  // Flat keyboard-navigation order matching the visual list: each parent
  // immediately followed by its own children.
  const flatOrder: WikiSummary[] = [];
  for (const p of pages.filter((p) => !p.parentId)) {
    flatOrder.push(p);
    for (const c of pages.filter((c) => c.parentId === p.id)) flatOrder.push(c);
  }
  const [selectedIndex, setSelectedIndex] = useState(0);
  useEffect(() => {
    const i = flatOrder.findIndex((p) => p.slug === slug);
    if (i !== -1) setSelectedIndex(i);
  }, [slug, pages.length]);

  useEffect(() => {
    if (!isDesktop) return;
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.code === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(flatOrder.length - 1, i + 1));
      } else if (e.code === "Enter" || e.key.toLowerCase() === "t") {
        const target = flatOrder[selectedIndex];
        if (target) navigate(`/wiki/${target.slug}`);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDesktop, flatOrder, selectedIndex, navigate]);

  const pagesNav = (
    <nav>
      <h3 style={{ fontSize: `${0.9 * scale}rem` }}>
        Pages{isDesktop && <span style={{ opacity: 0.4, fontWeight: "normal", fontSize: "0.8em" }}> (use ↑↓)</span>}
      </h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {pages
          .filter((p) => !p.parentId)
          .map((p) => (
            <li key={p.id} style={{ marginBottom: "0.3rem" }}>
              <Link to={`/wiki/${p.slug}`} style={flatOrder[selectedIndex]?.id === p.id ? { outline: "1px dashed var(--accent-forum)", padding: "0 0.2rem" } : undefined}>
                {p.title}
              </Link>
              <ul style={{ listStyle: "none", paddingLeft: "0.8rem" }}>
                {pages
                  .filter((c) => c.parentId === p.id)
                  .map((c) => (
                    <li key={c.id}>
                      <Link to={`/wiki/${c.slug}`} style={flatOrder[selectedIndex]?.id === c.id ? { outline: "1px dashed var(--accent-forum)", padding: "0 0.2rem" } : undefined}>
                        {c.title}
                      </Link>
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
        (current.contentMarkdown.trim() === "@branch-index"
          ? <BranchIndexList />
          : current.contentMarkdown.trim() === "@collaborator-index"
          ? <CollaboratorIndexList />
          : renderMarkdown(current.contentMarkdown, navigate))}
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
