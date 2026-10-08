// The Log's explorer: the wiki's pages (which nest) and the news posts, shown as one tree. Pure, so it is tested without a browser.
import { fold } from "./spaceHubs";

export interface WikiSummary { id: number; slug: string; title: string; parentId: number | null }
export interface WikiNode { page: WikiSummary; children: WikiNode[]; depth: number }

/** Nests pages under their parents, keeping the order the server gave. A page whose parent is missing becomes a top-level page, and a loop can't hang it. */
export function buildTree(pages: WikiSummary[]): WikiNode[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const childrenOf = new Map<number | null, WikiSummary[]>();
  for (const p of pages) {
    const key = p.parentId !== null && byId.has(p.parentId) && p.parentId !== p.id ? p.parentId : null;
    (childrenOf.get(key) ?? childrenOf.set(key, []).get(key)!).push(p);
  }
  const seen = new Set<number>();
  const make = (p: WikiSummary, depth: number): WikiNode => {
    seen.add(p.id);
    return { page: p, depth, children: (childrenOf.get(p.id) ?? []).filter((c) => !seen.has(c.id)).map((c) => make(c, depth + 1)) };
  };
  const roots = (childrenOf.get(null) ?? []).map((p) => make(p, 0));
  // pages only reachable through a loop (a is b's parent and b is a's parent) would vanish: show them at the top instead
  for (const p of pages) if (!seen.has(p.id)) roots.push(make(p, 0));
  return roots;
}

/** Ids of every page that has children (the ones that can open and close). */
export function folderIds(nodes: WikiNode[]): number[] {
  const out: number[] = [];
  const walk = (ns: WikiNode[]) => ns.forEach((n) => { if (n.children.length) { out.push(n.page.id); walk(n.children); } });
  walk(nodes);
  return out;
}

/** The ids above a page, nearest first: what has to be open for the page to be visible. */
export function ancestorIds(pages: WikiSummary[], slug: string | undefined): number[] {
  if (!slug) return [];
  const byId = new Map(pages.map((p) => [p.id, p]));
  const out: number[] = [];
  let cur = pages.find((p) => p.slug === slug);
  const guard = new Set<number>();
  while (cur && cur.parentId !== null && byId.has(cur.parentId) && !guard.has(cur.parentId)) {
    guard.add(cur.parentId);
    out.push(cur.parentId);
    cur = byId.get(cur.parentId);
  }
  return out;
}

/** A search shows the pages whose title matches AND the pages above them, so a match is never stranded. Every word must match; accents and case don't matter. */
export function searchTree(nodes: WikiNode[], query: string): { visible: Set<number>; matches: Set<number> } {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const visible = new Set<number>(), matches = new Set<number>();
  if (words.length === 0) return { visible, matches };
  const walk = (n: WikiNode): boolean => {
    const title = fold(n.page.title);
    const self = words.every((w) => title.includes(w));
    let below = false;
    for (const c of n.children) if (walk(c)) below = true;
    if (self) matches.add(n.page.id);
    if (self || below) visible.add(n.page.id);
    return self || below;
  };
  nodes.forEach(walk);
  return { visible, matches };
}

export interface Row {
  key: string;
  kind: "news-folder" | "post" | "page" | "studies" | "study";
  depth: number;
  open?: boolean; // for folders
  hasChildren?: boolean;
  to: string;
  label: string;
  id?: number;
}

export interface PostLite { id: number; slug: string; title: string; publishedAt: string }
export interface StudyLite { slug: string; title: string; owner?: string; updatedAt?: string }
export const NEWS_FOLDER_LIMIT = 8;
export const STUDIES_FOLDER_LIMIT = 8;

/** The rows to draw, top to bottom: News (with its newest posts), then the wiki's pages, then Studies (with the most recently updated ones). */
export function visibleRows(opts: { nodes: WikiNode[]; posts: PostLite[]; open: Set<number>; newsOpen: boolean; query: string; studies?: StudyLite[]; studiesOpen?: boolean }): Row[] {
  const { nodes, posts, open, newsOpen, query } = opts;
  const studies = opts.studies ?? [];
  const studiesOpen = opts.studiesOpen ?? false;
  const rows: Row[] = [];
  const searching = query.trim().length > 0;
  const { visible } = searchTree(nodes, query);
  const matchedPosts = searching ? posts.filter((p) => fold(p.title).includes(fold(query).trim()) || fold(query).split(/\s+/).filter(Boolean).every((w) => fold(p.title).includes(w))) : posts;
  if (!searching || matchedPosts.length > 0 || fold("news").includes(fold(query).trim())) {
    const isOpen = searching ? matchedPosts.length > 0 : newsOpen;
    rows.push({ key: "news", kind: "news-folder", depth: 0, open: isOpen, hasChildren: posts.length > 0, to: "/news", label: "News" });
    if (isOpen) for (const p of matchedPosts.slice(0, searching ? 50 : NEWS_FOLDER_LIMIT)) rows.push({ key: `post-${p.id}`, kind: "post", depth: 1, to: `/news/${p.slug}`, label: p.title });
  }
  const walk = (n: WikiNode) => {
    if (searching && !visible.has(n.page.id)) return;
    const isOpen = searching ? true : open.has(n.page.id);
    rows.push({ key: `page-${n.page.id}`, kind: "page", depth: n.depth, open: isOpen, hasChildren: n.children.length > 0, to: `/wiki/${n.page.slug}`, label: n.page.title, id: n.page.id });
    if (isOpen) n.children.forEach(walk);
  };
  nodes.forEach(walk);
  // Studies: a folder like News. A search looks inside the studies' titles (and their owners').
  const words = fold(query).split(/\s+/).filter(Boolean);
  const matchedStudies = searching ? studies.filter((st) => words.every((w) => fold(`${st.title} ${st.owner ?? ""}`).includes(w))) : studies;
  if (!searching || matchedStudies.length > 0 || fold("studies").includes(fold(query).trim())) {
    const isOpen = searching ? matchedStudies.length > 0 : studiesOpen;
    rows.push({ key: "studies", kind: "studies", depth: 0, open: isOpen, hasChildren: studies.length > 0, to: "/xenolab?tab=studies", label: "Studies" });
    if (isOpen) for (const st of matchedStudies.slice(0, searching ? 50 : STUDIES_FOLDER_LIMIT)) rows.push({ key: `study-${st.slug}`, kind: "study", depth: 1, to: `/study/${st.slug}`, label: st.title });
  }
  return rows;
}
