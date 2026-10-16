// The Log export: file layout, wiki nesting, reading order of the compiled file, escaping. Pure: runs without a database.
import { buildLogExport, segment, wikiOrder, type LogData } from "../src/lib/logExport.js";

const ok = (c: unknown, m: string) => { if (!c) { console.error("FAIL", m); process.exit(1); } console.log("ok  ", m); };
const D = (s: string) => new Date(s);

const data: LogData = {
  wiki: [
    { id: 1, slug: "core", title: "Core", parentId: null, contentMarkdown: "Root text.", updatedAt: D("2026-10-01T00:00:00Z") },
    { id: 2, slug: "signals", title: "Signals", parentId: 1, contentMarkdown: "About signals.", updatedAt: D("2026-10-02T00:00:00Z") },
    { id: 3, slug: "pulse", title: "Pulse", parentId: 2, contentMarkdown: "A pulse \"quoted\".", updatedAt: D("2026-10-03T00:00:00Z") },
    { id: 4, slug: "archive", title: "Archive", parentId: null, contentMarkdown: "Old.", updatedAt: D("2026-10-04T00:00:00Z") },
  ],
  news: [
    { slug: "first", title: "First post", contentMarkdown: "Hello.", publishedAt: D("2026-09-01T10:00:00Z") },
    { slug: "second", title: "Second: {{X}}", contentMarkdown: "Later.\n\n```\ncode\n```", publishedAt: D("2026-10-05T10:00:00Z") },
  ],
  studies: [
    {
      slug: "decay", title: "Decay of tones", body: "The body.", status: "COMPLETE", updatedAt: D("2026-10-06T00:00:00Z"), owner: "ann",
      branches: [{ name: "Soundbay" }],
      annotations: [{ position: 2, text: "Second note [link](https://example.org)" }, { position: 1, text: "First note" }],
      charts: [{ position: 1, title: "Decay curve", kind: "LINE", xLabel: "t", yLabel: "dB", dataCsv: "t,dB\n0,0\n1,-6\n" }],
    },
  ],
};

const out = buildLogExport(data, { base: "https://exomusica.example/", today: D("2026-10-16T12:00:00Z") });
const paths = out.files.map((f) => f.path);
const get = (p: string) => out.files.find((f) => f.path === p)?.text ?? "";

ok(paths[0] === "Exomusica Log.md", "the compiled file comes first");
ok(paths.includes("README.md"), "the zip has a README");
ok(paths.includes("wiki/core.md") && paths.includes("wiki/core/signals.md") && paths.includes("wiki/core/signals/pulse.md"), "wiki pages sit in the tree of their parents");
ok(paths.includes("wiki/archive.md"), "a top-level page is a file at the top of wiki/");
ok(paths.includes("news/2026-10-05-second.md") && paths.includes("news/2026-09-01-first.md"), "news files are named by publish date and slug");
ok(paths.includes("studies/decay.md"), "a study is one file");
ok(out.counts.wiki === 4 && out.counts.news === 2 && out.counts.studies === 1, "counts match the input");

// wiki order: roots by title, children under their parent
const order = wikiOrder(data.wiki).map((x) => x.page.slug);
ok(order.join(",") === "archive,core,signals,pulse", `wiki order is a tree sorted by title (${order.join(",")})`);
ok(wikiOrder(data.wiki).find((x) => x.page.slug === "pulse")?.depth === 2, "a grandchild is depth 2");

// front matter: quoted values, a source link per entry
const pulse = get("wiki/core/signals/pulse.md");
ok(pulse.startsWith("---\ntitle: \"Pulse\"\n"), "a wiki file starts with its front matter");
ok(pulse.includes("source: \"https://exomusica.example/wiki/pulse\""), "a wiki file links to its page on the site (PUBLIC_URL, trailing slash removed)");
ok(pulse.includes("A pulse \"quoted\"."), "the page text is kept as written, quotes included");

// news: tokens are filled before this function (the route does it); the title is kept as given here
ok(get("news/2026-10-05-second.md").includes("```\ncode\n```"), "news keeps its code blocks");

// study: notes sorted by number, chart data in a fence that cannot close early
const study = get("studies/decay.md");
ok(study.includes("status: \"COMPLETE\"") && study.includes("author: \"ann\""), "a study's front matter has status and author");
ok(study.indexOf("[1] First note") < study.indexOf("[2] Second note"), "notes are sorted by their number");
ok(study.includes("Second note [link](https://example.org)"), "notes keep their links");
ok(study.includes("### Decay curve") && study.includes("Axes: t / dB"), "a chart has its title and axes");
ok(study.includes("```\nt,dB\n0,0\n1,-6\n```"), "a chart's data is a CSV block");

// a CSV containing backticks gets a longer fence, so it cannot end the block early
const tricky = buildLogExport({ wiki: [], news: [], studies: [{ slug: "t", title: "T", body: "b", status: "IN_PROGRESS", updatedAt: D("2026-10-06T00:00:00Z"), owner: "x", branches: [], annotations: [], charts: [{ position: 1, title: "c", kind: "LINE", xLabel: null, yLabel: null, dataCsv: "a\n```\nb" }] }] }, { base: "", today: D("2026-10-16T00:00:00Z") });
ok(tricky.files.find((f) => f.path === "studies/t.md")!.text.includes("````\na\n```\nb\n````"), "a fence longer than the backticks inside it");

// the compiled file: sections in order, every entry present, the headings nest
const c = out.compiled;
ok(c.indexOf("# Wiki") < c.indexOf("# News") && c.indexOf("# News") < c.indexOf("# Studies"), "compiled file: Wiki, then News, then Studies");
ok(c.includes("# Exomusica Log") && c.includes("Exported 2026-10-16"), "compiled file has a title and the export date");
ok(c.includes("#### Pulse"), "a grandchild page is a level-4 heading (2 + depth)");
ok(c.indexOf("Second: {{X}}") < c.indexOf("First post"), "news is newest first");
ok(c.indexOf("## Decay of tones") > c.indexOf("## Second: {{X}}"), "studies come after news");

// segment(): safe names
ok(segment("Hello World!/x", "fb") === "hello-world-x", "a name is lower case with dashes");
ok(segment("!!!", "fb") === "fb", "an empty name falls back");

// a parent loop cannot repeat a page
const loop = wikiOrder([
  { id: 1, slug: "a", title: "A", parentId: 2, contentMarkdown: "", updatedAt: D("2026-10-01T00:00:00Z") },
  { id: 2, slug: "b", title: "B", parentId: 1, contentMarkdown: "", updatedAt: D("2026-10-01T00:00:00Z") },
]);
ok(loop.length <= 2, "a loop of parents lists each page at most once");

console.log("logExport ok");
