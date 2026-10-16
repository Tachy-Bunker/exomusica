// The Log, exported as Markdown: one file per wiki page (in the wiki's folder tree), per news post and per study,
// plus one compiled "Exomusica Log.md" that holds all of it in reading order. Pure: the route loads the rows and zips the result.

export interface ExWiki { id: number; slug: string; title: string; parentId: number | null; contentMarkdown: string; updatedAt: Date }
export interface ExNews { slug: string; title: string; contentMarkdown: string; publishedAt: Date }
export interface ExChart { position: number; title: string; kind: string; xLabel: string | null; yLabel: string | null; dataCsv: string }
export interface ExNote { position: number; text: string }
export interface ExStudy {
  slug: string; title: string; body: string; status: string; updatedAt: Date; owner: string;
  branches: { name: string }[]; annotations: ExNote[]; charts: ExChart[];
}
export interface LogData { wiki: ExWiki[]; news: ExNews[]; studies: ExStudy[] }
export interface ExportFile { path: string; text: string }
export interface LogExport { files: ExportFile[]; compiled: string; counts: { wiki: number; news: number; studies: number } }

/** A file or folder name from a slug: lower case, letters, digits, dashes. Slugs are already like this; this keeps a stray character from breaking a zip. */
export function segment(s: string, fallback: string): string {
  return s.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || fallback;
}
const day = (d: Date): string => d.toISOString().slice(0, 10);
/** YAML double-quoted scalars are JSON-compatible, so JSON.stringify gives a safe value for any title. */
const yq = (s: string): string => JSON.stringify(s);
function frontMatter(fields: [string, string][]): string {
  return ["---", ...fields.map(([k, v]) => `${k}: ${yq(v)}`), "---", ""].join("\n");
}
/** A fence longer than any run of backticks inside the text, so CSV or code can never close it early. */
function fence(text: string): string {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((r) => r.length));
  const f = "`".repeat(longest + 1);
  return `${f}\n${text.replace(/\n+$/, "")}\n${f}`;
}

/** Wiki pages sorted the way the site lists them (by title, children under their parent). */
export function wikiOrder(pages: ExWiki[]): { page: ExWiki; depth: number; ancestors: string[] }[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const kids = new Map<number | null, ExWiki[]>();
  for (const p of pages) {
    const key = p.parentId != null && byId.has(p.parentId) ? p.parentId : null;
    kids.set(key, [...(kids.get(key) ?? []), p]);
  }
  const out: { page: ExWiki; depth: number; ancestors: string[] }[] = [];
  const walk = (parent: number | null, depth: number, ancestors: string[], seen: Set<number>): void => {
    for (const p of (kids.get(parent) ?? []).sort((a, b) => a.title.localeCompare(b.title))) {
      if (seen.has(p.id)) continue; // a broken loop of parents cannot repeat a page
      seen.add(p.id);
      out.push({ page: p, depth, ancestors });
      walk(p.id, depth + 1, [...ancestors, segment(p.slug, `page-${p.id}`)], seen);
    }
  };
  walk(null, 0, [], new Set());
  return out;
}

export function buildLogExport(data: LogData, opts: { base: string; today: Date }): LogExport {
  const base = opts.base.replace(/\/$/, "");
  const url = (kind: "wiki" | "news" | "study", slug: string): string => `${base}/${kind === "study" ? "study" : kind}/${slug}`;
  const files: ExportFile[] = [];
  const parts: string[] = [];
  const wiki = wikiOrder(data.wiki);
  const news = [...data.news].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  const studies = [...data.studies].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
  parts.push(`# Exomusica Log\n\nExported ${day(opts.today)}: ${count(wiki.length, "wiki page", "wiki pages")}, ${count(news.length, "news post", "news posts")}, ${count(studies.length, "study", "studies")}. Media in the text is still a link to the site.\n`);

  if (wiki.length) {
    parts.push("# Wiki\n");
    for (const { page, depth, ancestors } of wiki) {
      const dir = ["wiki", ...ancestors];
      const name = segment(page.slug, `page-${page.id}`);
      files.push({ path: [...dir, `${name}.md`].join("/"), text: frontMatter([["title", page.title], ["source", url("wiki", page.slug)], ["updated", day(page.updatedAt)]]) + `# ${page.title}\n\n${page.contentMarkdown.trim()}\n` });
      parts.push(`${"#".repeat(Math.min(2 + depth, 6))} ${page.title}\n\nSource: ${url("wiki", page.slug)}\n\n${page.contentMarkdown.trim()}\n`);
    }
  }

  if (news.length) {
    parts.push("# News\n");
    for (const n of news) {
      const stamp = day(n.publishedAt);
      const name = `${stamp}-${segment(n.slug, "post")}`;
      files.push({ path: `news/${name}.md`, text: frontMatter([["title", n.title], ["published", stamp], ["source", url("news", n.slug)]]) + `# ${n.title}\n\n${n.contentMarkdown.trim()}\n` });
      parts.push(`## ${n.title}\n\nPublished ${stamp}. Source: ${url("news", n.slug)}\n\n${n.contentMarkdown.trim()}\n`);
    }
  }

  if (studies.length) {
    parts.push("# Studies\n");
    for (const s of studies) {
      const name = segment(s.slug, "study");
      const branches = s.branches.map((b) => b.name).join(", ");
      const meta = [`Status: ${s.status === "COMPLETE" ? "complete" : "in progress"}`, `Author: ${s.owner}`, branches ? `Branches: ${branches}` : "", `Updated ${day(s.updatedAt)}`].filter(Boolean).join(" · ");
      const notes = [...s.annotations].sort((a, b) => a.position - b.position);
      const charts = [...s.charts].sort((a, b) => a.position - b.position);
      const notesMd = notes.length ? `\n## Notes\n\n${notes.map((a) => `[${a.position}] ${a.text.trim()}`).join("\n\n")}\n` : "";
      const chartsMd = charts.length ? `\n## Charts\n\n${charts.map((c) => `### ${c.title}\n\n${c.xLabel || c.yLabel ? `Axes: ${c.xLabel ?? "x"} / ${c.yLabel ?? "y"}\n\n` : ""}${fence(c.dataCsv)}`).join("\n\n")}\n` : "";
      const body = `${s.body.trim()}\n${notesMd}${chartsMd}`;
      files.push({ path: `studies/${name}.md`, text: frontMatter([["title", s.title], ["author", s.owner], ["status", s.status], ["updated", day(s.updatedAt)], ["source", url("study", s.slug)]]) + `# ${s.title}\n\n${meta}\n\n${body}` });
      parts.push(`## ${s.title}\n\n${meta}. Source: ${url("study", s.slug)}\n\n${body}`);
    }
  }

  const readme = [
    "# Exomusica Log (export)",
    "",
    `Exported ${day(opts.today)}.`,
    "",
    "- `Exomusica Log.md`: everything in one file, in reading order (wiki, news, studies).",
    "- `wiki/`: wiki pages, in the folder tree of the wiki (a page's sub-pages sit in a folder named after it).",
    "- `news/`: news posts, one file each, named by publish date.",
    "- `studies/`: studies, one file each, with notes and the saved chart data at the end.",
    "",
    "Each file starts with a short header (title, source link, dates). Images, audio and downloads stay as links to the site.",
    "Chart data is the last copy saved with the study; a chart linked to a live CSV shows that CSV's last saved state here.",
    "",
  ].join("\n");
  files.push({ path: "README.md", text: readme });

  const compiled = parts.join("\n") + "\n";
  files.unshift({ path: "Exomusica Log.md", text: compiled });
  return { files, compiled, counts: { wiki: wiki.length, news: news.length, studies: studies.length } };
}
