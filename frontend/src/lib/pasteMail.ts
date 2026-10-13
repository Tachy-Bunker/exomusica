/** Pasting formatted text (from Word, Google Docs, a web page, another mail) into the composer: HTML → the composer's own markup. No dependency; walks the DOM the browser already parsed. */
import type { Edit } from "./mdEdit";

interface N { nodeType: number; nodeName: string; textContent: string | null; childNodes: ArrayLike<N>; getAttribute?(k: string): string | null }
const SKIP = new Set(["SCRIPT", "STYLE", "HEAD", "META", "LINK", "TITLE", "NOSCRIPT", "SVG", "IFRAME"]);
const BLOCK = new Set(["P", "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "MAIN", "TR", "TABLE", "FIGURE", "ADDRESS"]);

const styleOf = (n: N): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const part of (n.getAttribute?.("style") ?? "").split(";")) { const i = part.indexOf(":"); if (i > 0) out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim().toLowerCase(); }
  return out;
};
function hexOf(c: string): string | null {
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c); if (m3) return `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}`.toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(c); if (!m) return null;
  return "#" + [m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, "0")).join("");
}
/** Plain text colours (black, white, greys) are the page's own, not a choice: only real colours travel. */
function chosenColour(c: string | undefined): string | null {
  const h = c ? hexOf(c) : null; if (!h) return null;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return Math.max(r, g, b) - Math.min(r, g, b) < 40 ? null : h;
}
function chosenSize(s: string | undefined): number | null {
  const m = s ? /^([\d.]+)(px|pt)$/.exec(s) : null; if (!m) return null;
  const px = Number(m[1]) * (m[2] === "pt" ? 4 / 3 : 1); const r = Math.round(px);
  return r >= 10 && r <= 48 && (r <= 13 || r >= 20) ? r : null; // ordinary body sizes are not a choice either
}

const wrapInline = (t: string, a: string, b = a): string => { const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(t) as RegExpExecArray; return m[2] ? `${m[1]}${a}${m[2]}${b}${m[3]}` : t; };

export function htmlToMail(root: N): string {
  let pre = 0;
  const kids = (n: N, ctx: { list?: "ul" | "ol"; n?: number; depth: number }): string => { let out = ""; for (let i = 0; i < n.childNodes.length; i++) out += walk(n.childNodes[i], ctx); return out; };
  const block = (s: string): string => (s.trim() ? `\n\n${s.trim()}\n\n` : "");
  function walk(n: N, ctx: { list?: "ul" | "ol"; n?: number; depth: number }): string {
    if (n.nodeType === 3) { const t = n.textContent ?? ""; return pre ? t : t.replace(/[\s ]+/g, " "); }
    if (n.nodeType !== 1 && n.nodeType !== 11 && n.nodeType !== 9) return "";
    const tag = n.nodeName.toUpperCase();
    if (SKIP.has(tag)) return "";
    const st = styleOf(n);
    if (tag === "BR") return "\n";
    if (tag === "HR") return "\n\n---\n\n";
    if (tag === "IMG") { const src = n.getAttribute?.("src") ?? ""; return /^https?:\/\//i.test(src) ? `![${(n.getAttribute?.("alt") ?? "").replace(/[\[\]]/g, "")}](${src})` : ""; }
    if (/^H[1-6]$/.test(tag)) { const lvl = Math.min(3, Number(tag[1])); return block(`${"#".repeat(lvl)} ${kids(n, ctx).replace(/\s+/g, " ").trim()}`); }
    if (tag === "PRE") { pre++; const t = kids(n, ctx); pre--; return `\n\n\`\`\`\n${t.replace(/\n+$/, "")}\n\`\`\`\n\n`; }
    if (tag === "BLOCKQUOTE") return block(kids(n, ctx).trim().split("\n").map((l) => (l.trim() ? `> ${l}` : ">")).join("\n"));
    if (tag === "UL" || tag === "OL") {
      let k = 0, out = "";
      for (let i = 0; i < n.childNodes.length; i++) { const c = n.childNodes[i]; if (c.nodeType === 1 && c.nodeName.toUpperCase() === "LI") { k++; out += walk(c, { list: tag === "UL" ? "ul" : "ol", n: k, depth: ctx.depth + 1 }); } }
      return ctx.depth > 0 ? `\n${out}` : block(out.replace(/\n+$/, ""));
    }
    if (tag === "LI") {
      const body = kids(n, ctx).trim().replace(/\n{2,}/g, "\n"); const mark = ctx.list === "ol" ? `${ctx.n}. ` : "- ";
      return `${"  ".repeat(Math.max(0, ctx.depth - 1))}${mark}${body.split("\n").map((l, i) => (i ? `${"  ".repeat(ctx.depth)}${l.trim()}` : l)).join("\n")}\n`;
    }
    if (tag === "TABLE") {
      const rows: string[][] = [];
      const grab = (x: N) => { for (let i = 0; i < x.childNodes.length; i++) { const c = x.childNodes[i]; const t = c.nodeName.toUpperCase(); if (t === "TR") { const cells: string[] = []; for (let j = 0; j < c.childNodes.length; j++) { const d = c.childNodes[j]; if (/^T[DH]$/.test(d.nodeName.toUpperCase())) cells.push(kids(d, ctx).replace(/\s+/g, " ").replace(/\|/g, "/").trim()); } if (cells.length) rows.push(cells); } else if (c.nodeType === 1) grab(c); } };
      grab(n); if (!rows.length) return "";
      const w = Math.max(...rows.map((r) => r.length)); const line = (r: string[]) => `| ${Array.from({ length: w }, (_, i) => r[i] ?? "").join(" | ")} |`;
      return block([line(rows[0]), `| ${Array(w).fill("---").join(" | ")} |`, ...rows.slice(1).map(line)].join("\n"));
    }
    let inner = kids(n, ctx);
    if (tag === "A") {
      const href = n.getAttribute?.("href") ?? ""; const text = inner.replace(/\s+/g, " ").trim();
      return /^(https?:|mailto:)/i.test(href) && text ? ` [${text.replace(/[\[\]]/g, "")}](${href})`.replace(/^ /, inner.startsWith(" ") ? " " : "") : inner;
    }
    // inline emphasis: tags, and the styles Word and Google Docs use instead of tags (Docs wraps everything in <b style="font-weight:normal">)
    const w = st["font-weight"]; const bold = (tag === "B" || tag === "STRONG") ? !(w === "normal" || w === "400") : !!w && (w === "bold" || Number(w) >= 600);
    const italic = tag === "I" || tag === "EM" || st["font-style"] === "italic";
    const under = tag === "U" || (st["text-decoration"] ?? st["text-decoration-line"] ?? "").includes("underline");
    const strike = tag === "S" || tag === "STRIKE" || tag === "DEL" || (st["text-decoration"] ?? st["text-decoration-line"] ?? "").includes("line-through");
    if (tag === "CODE" && !pre) inner = wrapInline(inner, "`");
    if (tag === "SUP") inner = wrapInline(inner, "^");
    if (tag === "SUB") inner = wrapInline(inner, "~");
    if (tag === "MARK") inner = wrapInline(inner, "==");
    if (bold && inner.trim()) inner = wrapInline(inner, "**");
    if (italic && inner.trim()) inner = wrapInline(inner, "*");
    if (under && tag !== "A" && inner.trim()) inner = wrapInline(inner, "++");
    if (strike && inner.trim()) inner = wrapInline(inner, "~~");
    const col = chosenColour(st["color"] ?? (tag === "FONT" ? n.getAttribute?.("color") ?? undefined : undefined)), size = chosenSize(st["font-size"]);
    if ((col || size) && inner.trim() && !/\n/.test(inner)) { const attrs = [col ? `c:${col}` : "", size ? `s:${size}` : ""].filter(Boolean).join(" "); inner = wrapInline(inner, `{${attrs}|`, "}"); }
    if (BLOCK.has(tag) || tag === "BODY" || tag === "HTML") {
      if (st["text-align"] === "center" || st["text-align"] === "right") { const t = inner.trim(); return t ? `\n\n:::${st["text-align"]}\n${t}\n:::\n\n` : ""; }
      return tag === "BODY" || tag === "HTML" ? inner : block(inner);
    }
    return inner;
  }
  const out = walk(root, { depth: 0 });
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");
}

/** Does this HTML carry anything the plain text would lose? (A copy from a code editor or a text box is "formatted" HTML with nothing in it.) */
export function worthConverting(html: string, md: string, plain: string): boolean {
  if (!html.trim()) return false;
  return md.replace(/\s+/g, " ").trim() !== plain.replace(/\s+/g, " ").trim();
}

/** The paste handler for a textarea: converts, inserts at the selection, and returns the edit (or null to let the browser paste plain text). */
export function pasteEdit(e: { clipboardData: DataTransfer | null }, value: string, start: number, end: number, parse: (html: string) => N = (h) => new DOMParser().parseFromString(h, "text/html").body as unknown as N): Edit | null {
  const cd = e.clipboardData; if (!cd) return null;
  const html = cd.getData("text/html"); if (!html || html.length > 2_000_000) return null;
  let md: string; try { md = htmlToMail(parse(html.replace(/<!--[\s\S]*?-->/g, ""))); } catch { return null; }
  if (!worthConverting(html, md, cd.getData("text/plain"))) return null;
  const ins = md.slice(0, 200_000);
  return { value: value.slice(0, start) + ins + value.slice(end), start: start + ins.length, end: start + ins.length };
}
