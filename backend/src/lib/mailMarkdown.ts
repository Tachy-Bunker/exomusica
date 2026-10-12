// The email dialect of the site's writing format -> HTML that survives mail clients (inline styles only, tables for the frame, no scripts, no classes),
// a plain-text twin, and the list of files the message needs. Pure: nothing is read from disk here, the sender resolves the files.
//
// Same syntax as studies and articles where an email can carry it (headings, **bold**, *italic*, `code`, links, lists, > quotes, ---, tables, :::center blocks,
// ![alt](url){width=60% align=center}, @audio(url), @file(url)[label]) plus ++underline++, ==highlight==, ^sup^, ~sub~, {c:#c0392b s:18|coloured text} and [[Button]](url).

export interface MailAttachment { kind: "inline" | "file"; url: string; filename: string; cid?: string }
export interface MailRendered { html: string; text: string; attachments: MailAttachment[]; warnings: string[] }
export interface RenderOpts { sizeOf?: (url: string) => number | null }

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isLocal = (u: string) => u.startsWith("/uploads/") && !u.includes("..");
const isRemote = (u: string) => /^https?:\/\//i.test(u);
const baseName = (u: string): string => { try { return decodeURIComponent(u.split("?")[0].split("/").pop() ?? "file").replace(/^[0-9a-f]{8}-/, "") || "file"; } catch { return "file"; } };
const humanSize = (n: number): string => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const safeColour = (c: string): string | null => (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) || /^[a-z]{3,20}$/i.test(c) ? c : null);

// ---------------------------------------------------------------- blocks
type Block =
  | { t: "p"; lines: string[]; indent: number }
  | { t: "h"; level: 1 | 2 | 3; text: string }
  | { t: "hr" }
  | { t: "quote"; blocks: Block[] }
  | { t: "list"; items: { depth: number; ordered: boolean; text: string }[] }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "img"; alt: string; url: string; width?: string; align: "left" | "center" | "right" }
  | { t: "media"; kind: "audio" | "file" | "video"; url: string; label: string }
  | { t: "align"; align: "left" | "center" | "right"; blocks: Block[] };

const IMAGE_LINE = /^!\[(.*?)\]\((\S+)\)(?:\{([^{}]*)\})?$/;
const MEDIA_LINE = /^@(audio|file|video)\((\S+)\)(?:\[(.*?)\])?$/;
const LIST_LINE = /^((?:\t| {2})*)([-*]|\d+[.)])\s+(.*)$/;
const TABLE_SEP = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;
const cells = (l: string): string[] => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

function parseBlocks(lines: string[]): Block[] {
  const out: Block[] = [];
  let i = 0;
  const special = (l: string, next?: string): boolean =>
    /^(#{1,3})\s/.test(l) || /^(-{3,}|\*{3,})$/.test(l) || /^>/.test(l) || LIST_LINE.test(l) || IMAGE_LINE.test(l.trim()) || MEDIA_LINE.test(l.trim()) || /^:::(left|center|right)?$/.test(l.trim()) || (l.trim().startsWith("|") && next !== undefined && TABLE_SEP.test(next.trim()));
  while (i < lines.length) {
    const line = lines[i], t = line.trim();
    if (!t) { i++; continue; }
    const al = /^:::(left|center|right)$/.exec(t);
    if (al) {
      const inner: string[] = []; i++;
      while (i < lines.length && lines[i].trim() !== ":::") inner.push(lines[i++]);
      i++; out.push({ t: "align", align: al[1] as "left" | "center" | "right", blocks: parseBlocks(inner) }); continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(t);
    if (h) { out.push({ t: "h", level: h[1].length as 1 | 2 | 3, text: h[2] }); i++; continue; }
    if (/^(-{3,}|\*{3,})$/.test(t)) { out.push({ t: "hr" }); i++; continue; }
    if (/^>/.test(t)) {
      const inner: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) inner.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push({ t: "quote", blocks: parseBlocks(inner) }); continue;
    }
    if (t.startsWith("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1].trim())) {
      const head = cells(lines[i]); i += 2; const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      out.push({ t: "table", head, rows }); continue;
    }
    const lm = LIST_LINE.exec(line);
    if (lm) {
      const items: { depth: number; ordered: boolean; text: string }[] = [];
      while (i < lines.length) {
        const m = LIST_LINE.exec(lines[i]); if (!m) break;
        const tabs = (m[1].match(/\t/g) ?? []).length, spaces = (m[1].match(/ {2}/g) ?? []).length;
        items.push({ depth: Math.min(2, tabs + spaces), ordered: /\d/.test(m[2]), text: m[3] }); i++;
      }
      out.push({ t: "list", items }); continue;
    }
    const im = IMAGE_LINE.exec(t);
    if (im) {
      let width: string | undefined, align: "left" | "center" | "right" = "left";
      for (const part of (im[3] ?? "").split(/[\s,]+/)) {
        const m = /^(width|w|align)=(.+)$/i.exec(part); if (!m) continue;
        if (m[1].toLowerCase() === "align") { const a = m[2].toLowerCase(); if (a === "center" || a === "right") align = a; }
        else { const w = /^(\d+(?:\.\d+)?)(%|px)?$/i.exec(m[2]); if (w) width = w[2] === "%" ? `${Math.min(100, Math.max(5, Math.round(+w[1])))}%` : `${Math.min(4000, Math.max(20, Math.round(+w[1])))}px`; }
      }
      out.push({ t: "img", alt: im[1], url: im[2], width, align }); i++; continue;
    }
    const mm = MEDIA_LINE.exec(t);
    if (mm) { out.push({ t: "media", kind: mm[1] as "audio" | "file" | "video", url: mm[2], label: (mm[3] ?? "").trim() }); i++; continue; }
    const para: string[] = [];
    const lead = /^\t+/.exec(line)?.[0].length ?? 0;
    while (i < lines.length && lines[i].trim() && !(para.length > 0 && special(lines[i], lines[i + 1]))) para.push(lines[i++].trim());
    out.push({ t: "p", lines: para, indent: lead });
  }
  return out;
}

// ---------------------------------------------------------------- inline
const INLINE = new RegExp([
  "`(?<code>[^`\\n]+)`",
  "\\[\\[(?<btn>.+?)\\]\\]\\((?<btnUrl>https?:\\/\\/[^\\s)]+|mailto:[^\\s)]+)\\)",
  "\\[(?<ltext>.+?)\\]\\((?<lurl>https?:\\/\\/[^\\s)]+|mailto:[^\\s)]+|tel:[^\\s)]+)\\)",
  "\\*\\*(?<bold>.+?)\\*\\*",
  "\\*(?<ital>[^*\\s](?:.*?[^*\\s])?)\\*",
  "\\+\\+(?<under>.+?)\\+\\+",
  "~~(?<strike>.+?)~~",
  "==(?<mark>.+?)==",
  "\\^(?<sup>[^^\\s](?:[^^]*?[^^\\s])?)\\^",
  "~(?<sub>[^~\\s](?:[^~]*?[^~\\s])?)~",
  "\\{(?<attrs>(?:[cs]:[#\\w.]+\\s*)+)\\|(?<styled>(?:[^{}]|\\{[^{}]*\\})+?)\\}",
  "(?<auto>https?:\\/\\/[^\\s<]+)",
].join("|"), "g");

/** Inline formatting of text that is already HTML-escaped. */
function inline(escaped: string): string {
  let out = "", last = 0;
  for (const m of escaped.matchAll(INLINE)) {
    const g = m.groups ?? {}; const at = m.index ?? 0;
    out += escaped.slice(last, at); last = at + m[0].length;
    if (g.code !== undefined) out += `<code style="font-family:Menlo,Consolas,monospace;font-size:90%;background:#f1f1f1;padding:1px 5px;border-radius:3px">${g.code}</code>`;
    else if (g.btn !== undefined) out += `<a href="${g.btnUrl}" style="display:inline-block;padding:10px 20px;margin:2px 0;background:#111111;color:#ffffff;text-decoration:none;border-radius:4px;font-weight:600">${inline(g.btn)}</a>`;
    else if (g.ltext !== undefined) out += `<a href="${g.lurl}" style="color:#1a5fb4;text-decoration:underline">${inline(g.ltext)}</a>`;
    else if (g.bold !== undefined) out += `<strong>${inline(g.bold)}</strong>`;
    else if (g.ital !== undefined) out += `<em>${inline(g.ital)}</em>`;
    else if (g.under !== undefined) out += `<span style="text-decoration:underline">${inline(g.under)}</span>`;
    else if (g.strike !== undefined) out += `<span style="text-decoration:line-through">${inline(g.strike)}</span>`;
    else if (g.mark !== undefined) out += `<span style="background:#fff3a3">${inline(g.mark)}</span>`;
    else if (g.sup !== undefined) out += `<sup>${inline(g.sup)}</sup>`;
    else if (g.sub !== undefined) out += `<sub>${inline(g.sub)}</sub>`;
    else if (g.attrs !== undefined) {
      let style = "";
      for (const part of g.attrs.trim().split(/\s+/)) {
        const [k, v] = [part[0], part.slice(2)];
        if (k === "c") { const c = safeColour(v); if (c) style += `color:${c};`; }
        else if (k === "s") { const n = Math.min(40, Math.max(10, parseInt(v, 10) || 0)); if (n) style += `font-size:${n}px;line-height:1.3;`; }
      }
      out += style ? `<span style="${style}">${inline(g.styled)}</span>` : inline(g.styled);
    } else if (g.auto !== undefined) {
      const trail = /[.,;:!?)]+$/.exec(g.auto)?.[0] ?? ""; const url = trail ? g.auto.slice(0, -trail.length) : g.auto;
      out += `<a href="${url}" style="color:#1a5fb4;text-decoration:underline">${url}</a>${trail}`;
    }
  }
  return out + escaped.slice(last);
}
/** The words only: markers removed, links as "text (address)". */
function plain(src: string): string {
  return src
    .replace(/`([^`\n]+)`/g, "$1").replace(/\[\[(.+?)\]\]\(([^)\s]+)\)/g, "$1: $2").replace(/\[(.+?)\]\(([^)\s]+)\)/g, (_m, t: string, u: string) => (u.startsWith("mailto:") ? `${t} (${u.slice(7)})` : `${t} (${u})`))
    .replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*([^*\s](?:.*?[^*\s])?)\*/g, "$1").replace(/\+\+(.+?)\+\+/g, "$1").replace(/~~(.+?)~~/g, "$1").replace(/==(.+?)==/g, "$1")
    .replace(/\^([^^\s](?:[^^]*?[^^\s])?)\^/g, "^$1").replace(/~([^~\s](?:[^~]*?[^~\s])?)~/g, "_$1")
    .replace(/\{(?:[cs]:[#\w.]+\s*)+\|((?:[^{}]|\{[^{}]*\})+?)\}/g, "$1").replace(/\{(?:[cs]:[#\w.]+\s*)+\|((?:[^{}]|\{[^{}]*\})+?)\}/g, "$1");
}

// ---------------------------------------------------------------- render
export function renderMail(md: string, opts: RenderOpts = {}): MailRendered {
  const attachments: MailAttachment[] = []; const warnings: string[] = [];
  const addAttachment = (a: MailAttachment): MailAttachment => { const hit = attachments.find((x) => x.url === a.url && x.kind === a.kind); if (hit) return hit; attachments.push(a); return a; };
  const P = "margin:0 0 14px";
  const html = (blocks: Block[], align?: string): string => blocks.map((b) => {
    const ta = align ? `text-align:${align};` : "";
    switch (b.t) {
      case "p": return `<p style="${P};${ta}${b.indent ? `padding-left:${b.indent * 2}em;` : ""}">${b.lines.map((l) => inline(esc(l))).join("<br>")}</p>`;
      case "h": { const size = { 1: 24, 2: 20, 3: 17 }[b.level]; return `<h${b.level} style="margin:22px 0 8px;font-size:${size}px;line-height:1.25;font-weight:700;${ta}">${inline(esc(b.text))}</h${b.level}>`; }
      case "hr": return `<hr style="border:0;border-top:1px solid #dddddd;margin:22px 0">`;
      case "quote": return `<blockquote style="margin:14px 0;padding:2px 16px;border-left:3px solid #c9c9c9;color:#555555">${html(b.blocks, align)}</blockquote>`;
      case "list": {
        let s = ""; const stack: boolean[] = [];
        const tag = (o: boolean) => (o ? "ol" : "ul");
        for (const it of b.items) {
          while (stack.length - 1 > it.depth) s += `</li></${tag(stack.pop() as boolean)}>`;
          if (stack.length - 1 === it.depth && stack[it.depth] !== it.ordered) { s += `</li></${tag(stack.pop() as boolean)}>`; }
          if (stack.length - 1 === it.depth) s += "</li>";
          else while (stack.length - 1 < it.depth || stack.length === 0) { stack.push(it.ordered); s += `<${tag(it.ordered)} style="margin:0 0 14px;padding-left:1.6em;${ta}">`; }
          s += `<li style="margin:0 0 4px">${inline(esc(it.text))}`;
        }
        while (stack.length) s += `</li></${tag(stack.pop() as boolean)}>`;
        return s;
      }
      case "table": {
        const td = "border:1px solid #dddddd;padding:6px 10px;text-align:left;vertical-align:top";
        return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 14px;max-width:100%"><thead><tr>${b.head.map((c) => `<th style="${td};background:#f6f6f6">${inline(esc(c))}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td style="${td}">${inline(esc(c))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      }
      case "img": {
        const a = b.align === "center" ? "center" : b.align === "right" ? "right" : (align ?? "left");
        const style = `display:inline-block;border:0;height:auto;max-width:100%;${b.width ? `width:${b.width};` : ""}`;
        if (isLocal(b.url)) { const at = addAttachment({ kind: "inline", url: b.url, filename: baseName(b.url), cid: `img${attachments.filter((x) => x.kind === "inline").length + 1}@exomusica.mail` }); return `<div style="${P};text-align:${a}"><img src="cid:${at.cid}" alt="${esc(b.alt)}" style="${style}"></div>`; }
        if (isRemote(b.url)) return `<div style="${P};text-align:${a}"><img src="${esc(b.url)}" alt="${esc(b.alt)}" style="${style}"></div>`;
        warnings.push(`Picture not found: ${b.url}`); return "";
      }
      case "media": {
        const glyph = b.kind === "audio" ? "🎧" : b.kind === "video" ? "🎬" : "📎";
        if (isLocal(b.url)) {
          const name = b.label || baseName(b.url); const size = opts.sizeOf?.(b.url);
          addAttachment({ kind: "file", url: b.url, filename: b.label && /\.[a-z0-9]{2,5}$/i.test(baseName(b.url)) && !/\.[a-z0-9]{2,5}$/i.test(b.label) ? `${b.label}${baseName(b.url).match(/\.[a-z0-9]{2,5}$/i)![0]}` : baseName(b.url) });
          return `<p style="${P};${ta}">${glyph} <strong>${esc(name)}</strong> <span style="color:#777777">(attached${size ? `, ${humanSize(size)}` : ""})</span></p>`;
        }
        if (isRemote(b.url)) return `<p style="${P};${ta}">${glyph} <a href="${esc(b.url)}" style="color:#1a5fb4;text-decoration:underline">${esc(b.label || b.url)}</a></p>`;
        warnings.push(`File not found: ${b.url}`); return "";
      }
      case "align": return `<div style="text-align:${b.align}">${html(b.blocks, b.align)}</div>`;
    }
  }).join("\n");

  const text = (blocks: Block[]): string => blocks.map((b) => {
    switch (b.t) {
      case "p": return b.lines.map(plain).join("\n");
      case "h": return `${plain(b.text)}\n${"=".repeat(Math.min(40, plain(b.text).length))}`;
      case "hr": return "----------------";
      case "quote": return text(b.blocks).split("\n").map((l) => `> ${l}`).join("\n");
      case "list": { let n = 0; return b.items.map((it) => `${"  ".repeat(it.depth)}${it.ordered ? `${++n}.` : "-"} ${plain(it.text)}`).join("\n"); }
      case "table": return [b.head, ...b.rows].map((r) => r.map(plain).join(" | ")).join("\n");
      case "img": return b.alt ? `[picture: ${b.alt}]` : "[picture]";
      case "media": return isLocal(b.url) ? `[attached: ${b.label || baseName(b.url)}]` : `${b.label || "Link"}: ${b.url}`;
      case "align": return text(b.blocks);
    }
  }).filter(Boolean).join("\n\n");

  const blocks = parseBlocks(md.replace(/\r\n?/g, "\n").split("\n"));
  const body = html(blocks);
  const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#ffffff"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center" style="padding:16px"><table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px"><tr><td style="font-family:${FONT};font-size:16px;line-height:1.55;color:#222222">\n${body}\n</td></tr></table></td></tr></table></body></html>`;
  return { html: page, text: text(blocks), attachments, warnings };
}
