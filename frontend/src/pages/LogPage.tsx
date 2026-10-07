import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { BranchIndexList } from "../components/BranchIndexList";
import { CollaboratorIndexList } from "../components/CollaboratorIndexList";
import { api } from "../lib/api";
import { loadPosts, loadWikiPages, useLoaded } from "../lib/hubs";
import { isTypingTarget } from "../lib/isTypingTarget";
import { ancestorIds, buildTree, folderIds, visibleRows, type Row } from "../lib/logTree";
import { renderMarkdown } from "../lib/markdown";
import { useContentScaleStore } from "../lib/contentScaleStore";
import { useCustomFont, type FontInfo } from "../lib/useCustomFont";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useIsDesktop } from "../lib/useIsDesktop";

interface WikiFull { id: number; slug: string; title: string; contentMarkdown: string; font: FontInfo | null }
interface PostFull { id: number; slug: string; title: string; publishedAt: string; contentMarkdown: string; font: FontInfo | null }
const AUTO_OPEN_LIMIT = 40; // a small wiki opens fully; a big one opens only along the path to the page you are reading

function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/newsletter/subscribe", { method: "POST", body: JSON.stringify({ email }) });
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }
  if (status === "sent") return <p style={{ color: "var(--text-dim)" }}>Subscribed - you're on the list.</p>;
  return (
    <form onSubmit={submit} style={{ display: "flex", gap: "0.5rem", maxWidth: 360, flexWrap: "wrap" }}>
      <input type="email" required placeholder="you@example.com" aria-label="Email for the newsletter" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="btn btn-primary" type="submit">Subscribe</button>
      {status === "error" && <span style={{ color: "var(--accent-danger)" }}>Couldn't subscribe.</span>}
    </form>
  );
}

/**
 * The Log: the wiki's pages and the news in one explorer. News is a folder of posts; wiki pages nest to any depth.
 * Addresses are unchanged (/wiki/<page>, /news, /news/<post>), so every existing link keeps working.
 */
export function LogPage() {
  const { slug } = useParams<{ slug?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const scale = useContentScaleStore((s) => (isDesktop ? s.desktop : s.mobile));
  const isNews = location.pathname.startsWith("/news");
  const { data: pages } = useLoaded(loadWikiPages);
  const { data: posts } = useLoaded(loadPosts);
  const [page, setPage] = useState<WikiFull | null>(null);
  const [post, setPost] = useState<PostFull | null>(null);
  const font = useCustomFont((isNews ? post : page)?.font);
  useDocumentTitle(isNews ? (post?.title ?? "News") : (page?.title ?? "Log"));

  useEffect(() => { // /wiki on its own opens the site's default page, as it always has
    if (isNews || slug) return;
    api<{ defaultWikiPage: { slug: string } | null }>("/api/site-settings").then((s) => { if (s.defaultWikiPage) navigate(`/wiki/${s.defaultWikiPage.slug}`, { replace: true }); }).catch(() => {});
  }, [isNews, slug, navigate]);
  useEffect(() => {
    setPage(null);
    if (!isNews && slug) api<WikiFull>(`/api/wiki/${slug}`).then(setPage).catch(() => {});
  }, [isNews, slug]);
  useEffect(() => {
    setPost(null);
    if (isNews && slug) api<PostFull>(`/api/blog/${slug}`).then(setPost).catch(() => {});
  }, [isNews, slug]);

  // ---- the tree
  const nodes = useMemo(() => buildTree(pages ?? []), [pages]);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [newsOpen, setNewsOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [initialised, setInitialised] = useState(false);
  useEffect(() => {
    if (!pages || initialised) return;
    setOpen(new Set(pages.length <= AUTO_OPEN_LIMIT ? folderIds(nodes) : []));
    setInitialised(true);
  }, [pages, nodes, initialised]);
  useEffect(() => { // reading a page opens the way to it
    if (!pages || isNews || !slug) return;
    const above = ancestorIds(pages, slug);
    if (above.length) setOpen((o) => (above.every((id) => o.has(id)) ? o : new Set([...o, ...above])));
  }, [pages, isNews, slug]);

  const rows = useMemo(() => visibleRows({ nodes, posts: posts ?? [], open, newsOpen, query }), [nodes, posts, open, newsOpen, query]);
  const currentKey = isNews ? (slug ? `post-${posts?.find((p) => p.slug === slug)?.id}` : "news") : slug ? `page-${pages?.find((p) => p.slug === slug)?.id}` : "";
  const [selectedKey, setSelectedKey] = useState("");
  useEffect(() => { if (currentKey) setSelectedKey(currentKey); }, [currentKey]);

  useEffect(() => { // ↑ ↓ move through what's drawn; Enter (or T) opens it - as the Wiki and News lists always did
    if (!isDesktop) return;
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const i = rows.findIndex((r) => r.key === selectedKey);
      if (e.code === "ArrowUp") { e.preventDefault(); setSelectedKey(rows[Math.max(0, i - 1)]?.key ?? ""); }
      else if (e.code === "ArrowDown") { e.preventDefault(); setSelectedKey(rows[Math.min(rows.length - 1, i + 1)]?.key ?? ""); }
      else if (e.code === "Enter" || e.key.toLowerCase() === "t") { const r = rows[i]; if (r) navigate(r.to); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDesktop, rows, selectedKey, navigate]);

  const toggle = (r: Row) => (r.kind === "news-folder" ? setNewsOpen((v) => !v) : setOpen((o) => { const n = new Set(o); if (n.has(r.id!)) n.delete(r.id!); else n.add(r.id!); return n; }));
  const searching = query.trim().length > 0;
  const total = (pages?.length ?? 0) + (posts?.length ?? 0);

  const tree = (
    <nav className="log-tree" aria-label="Log contents">
      <div className="log-tree-tools">
        <input type="search" className="log-tree-search" placeholder="Search the Log" aria-label="Search the Log" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="log-search" />
        <span className="log-tree-buttons">
          <button type="button" className="btn" onClick={() => { setOpen(new Set(folderIds(nodes))); setNewsOpen(true); }} disabled={searching} data-testid="log-expand">Open all</button>
          <button type="button" className="btn" onClick={() => { setOpen(new Set()); setNewsOpen(false); }} disabled={searching} data-testid="log-collapse">Close all</button>
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="home-dim" data-testid="log-empty">Nothing in the Log matches. Try fewer words.</p>
      ) : (
        <ul className="log-rows" role="tree" data-testid="log-tree">
          {rows.map((r) => {
            const current = r.key === currentKey;
            return (
              <li key={r.key} role="treeitem" aria-level={r.depth + 1} aria-expanded={r.hasChildren && !searching ? r.open : undefined} aria-selected={current}
                  className={`log-row${current ? " current" : ""}${isDesktop && r.key === selectedKey ? " selected" : ""}${r.kind === "news-folder" || r.kind === "studies" ? " log-row-top" : ""}`} style={{ paddingLeft: `${r.depth * 0.9}rem` }} data-kind={r.kind}>
                {r.hasChildren && !searching ? (
                  <button type="button" className="log-chev" aria-label={`${r.open ? "Close" : "Open"} ${r.label}`} aria-expanded={r.open} onClick={() => toggle(r)} data-testid={`toggle-${r.key}`}>{r.open ? "▾" : "▸"}</button>
                ) : (
                  <span className="log-chev log-chev-none" aria-hidden="true" />
                )}
                <Link to={r.to} aria-current={current ? "page" : undefined}>{r.label}</Link>
                {r.kind === "studies" && <span className="home-dim log-hint"> Documented experiments</span>}
                {r.kind === "news-folder" && posts && <span className="home-dim log-hint"> {posts.length}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );

  const latest = (posts ?? []).slice(0, 3);
  const content = (
    <div style={{ fontFamily: font, fontSize: `${scale}rem` }} data-testid="log-content">
      {isNews && !slug && (
        <>
          <h1>News</h1>
          <NewsletterForm />
          <div className="log-posts">
            {posts && posts.length === 0 && <p className="home-dim">Nothing published yet.</p>}
            {(posts ?? []).map((p) => (
              <Link key={p.id} to={`/news/${p.slug}`} className="log-post">
                <h2>{p.title}</h2>
                <p className="mono home-dim">{new Date(p.publishedAt).toLocaleDateString()}</p>
              </Link>
            ))}
          </div>
        </>
      )}
      {isNews && slug && (
        <>
          <Link to="/news" className="home-dim">← News</Link>
          {!post ? <p>Loading…</p> : (
            <>
              <h1>{post.title}</h1>
              <p className="mono home-dim">{new Date(post.publishedAt).toLocaleDateString()}</p>
              {renderMarkdown(post.contentMarkdown, navigate)}
            </>
          )}
        </>
      )}
      {!isNews && !slug && (
        <>
          <h1>Log</h1>
          <p className="home-dim">The wiki and the news, in one place. Pick a page from the list{isDesktop ? "" : " above"}.</p>
          {latest.length > 0 && (
            <>
              <h2 className="home-h2" style={{ marginTop: "1.5rem" }}>Latest news</h2>
              <div className="log-posts">{latest.map((p) => <Link key={p.id} to={`/news/${p.slug}`} className="log-post"><h2>{p.title}</h2><p className="mono home-dim">{new Date(p.publishedAt).toLocaleDateString()}</p></Link>)}</div>
            </>
          )}
        </>
      )}
      {!isNews && slug && (
        !page ? <p>Loading…</p>
        : page.contentMarkdown.trim() === "@branch-index" ? <BranchIndexList />
        : page.contentMarkdown.trim() === "@collaborator-index" ? <CollaboratorIndexList />
        : renderMarkdown(page.contentMarkdown, navigate)
      )}
    </div>
  );

  if (!isDesktop) {
    return (
      <div data-testid="log-page">
        <details className="log-browse" open={!slug}>
          <summary>Browse the Log <span className="home-dim">({total} pages and posts)</span></summary>
          {tree}
        </details>
        {content}
      </div>
    );
  }
  return (
    <div className="log-layout" data-testid="log-page">
      <aside><h2 className="log-tree-title">Log</h2>{tree}</aside>
      <div className="log-main">{content}</div>
    </div>
  );
}
