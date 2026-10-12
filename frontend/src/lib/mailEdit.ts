/** Toolbar edits for the Outreach composer: the studies/articles toolbar plus what email can carry (underline, highlight, colour, size, sup/sub, button, alignment, table, merge fields). Pure: (text, selection) -> text, selection. */
import { applyMd, type Edit, type MdKind } from "./mdEdit";

export type MailKind = MdKind | "underline" | "highlight" | "sup" | "sub" | "h1" | "h2" | "h3" | "button" | "center" | "left" | "right" | "table" | "color" | "size" | "field" | "insert";

const WRAP: Record<string, [string, string, string]> = { underline: ["++", "++", "underlined"], highlight: ["==", "==", "highlighted"], sup: ["^", "^", "up"], sub: ["~", "~", "down"] };

function setAttr(attrs: string, key: string, val: string): string {
  const parts = attrs.trim().split(/\s+/).filter((p) => p[0] !== key);
  return [...parts, `${key}:${val}`].sort().join(" "); // c before s, always the same order
}
function wrap(value: string, start: number, end: number, a: string, b: string, ph: string): Edit {
  const sel = value.slice(start, end);
  if (sel && value.slice(start - a.length, start) === a && value.slice(end, end + b.length) === b)
    return { value: value.slice(0, start - a.length) + sel + value.slice(end + b.length), start: start - a.length, end: end - a.length };
  const body = sel || ph;
  return { value: value.slice(0, start) + a + body + b + value.slice(end), start: start + a.length, end: start + a.length + body.length };
}
const lineStart = (v: string, i: number): number => v.lastIndexOf("\n", i - 1) + 1;
const own = (value: string, start: number): string => (start > 0 && value[start - 1] !== "\n" ? "\n" : "");

export function applyMail(value: string, start: number, end: number, kind: MailKind, arg = ""): Edit {
  const W = WRAP[kind]; if (W) return wrap(value, start, end, W[0], W[1], W[2]);
  const sel = value.slice(start, end);
  switch (kind) {
    case "h1": case "h2": case "h3": {
      const p = kind === "h1" ? "# " : kind === "h2" ? "## " : "### ";
      const ls = lineStart(value, start), le0 = value.indexOf("\n", end), le = le0 === -1 ? value.length : le0;
      const lines = value.slice(ls, le).split("\n").map((l) => (l.startsWith(p) ? l.slice(p.length) : p + l.replace(/^#{1,3}\s+/, "")));
      const out = lines.join("\n"); return { value: value.slice(0, ls) + out + value.slice(le), start: ls, end: ls + out.length };
    }
    case "button": {
      const label = sel || "Listen", url = "https://", md = `[[${label}]](${url})`, us = start + label.length + 5;
      return { value: value.slice(0, start) + md + value.slice(end), start: us, end: us + url.length };
    }
    case "center": case "left": case "right": {
      const body = sel || "text", pre = own(value, start) + `:::${kind}\n`, post = "\n:::\n";
      return { value: value.slice(0, start) + pre + body + post + value.slice(end), start: start + pre.length, end: start + pre.length + body.length };
    }
    case "table": {
      const t = "| Event | Date | Link |\n| --- | --- | --- |\n| Name | 2026 | https:// |\n", ins = own(value, start) + t;
      return { value: value.slice(0, start) + ins + value.slice(end), start: start + ins.length - t.length + 2, end: start + ins.length - t.length + 7 };
    }
    case "color": case "size": {
      const key = kind === "color" ? "c" : "s";
      const val = kind === "color" ? (/^#[0-9a-f]{3,6}$/i.test(arg) ? arg : "#c0392b") : String(Math.max(10, Math.min(48, Number(arg) || 18)));
      // Colour and size share one span, {c:#… s:18|text}: applying the second to text already in a span (or a selected whole span) updates that span.
      const before = value.slice(0, start), after = value.slice(end);
      const inside = /\{((?:[cs]:[#\w.]+\s*)+)\|$/.exec(before);
      if (sel && inside && after.startsWith("}")) {
        const head = `{${setAttr(inside[1], key, val)}|`, at = start - inside[0].length;
        return { value: value.slice(0, at) + head + sel + after, start: at + head.length, end: at + head.length + sel.length };
      }
      const whole = /^\{((?:[cs]:[#\w.]+\s*)+)\|([^{}]+)\}$/.exec(sel);
      if (whole) {
        const head = `{${setAttr(whole[1], key, val)}|`;
        return { value: value.slice(0, start) + head + whole[2] + "}" + after, start: start + head.length, end: start + head.length + whole[2].length };
      }
      const a = `{${key}:${val}|`, body = sel || "text";
      return { value: value.slice(0, start) + a + body + "}" + value.slice(end), start: start + a.length, end: start + a.length + body.length };
    }
    case "field": {
      const ins = `{{${arg}}}`; return { value: value.slice(0, start) + ins + value.slice(end), start: start + ins.length, end: start + ins.length };
    }
    case "insert": { // a block of text, on its own lines
      const pre = own(value, start), ins = pre + arg + (arg.endsWith("\n") ? "" : "\n");
      return { value: value.slice(0, start) + ins + value.slice(end), start: start + ins.length, end: start + ins.length };
    }
    default: return applyMd(value, start, end, kind as MdKind);
  }
}

/** The line that attaches a file the server holds: pictures show in the body, audio and other files travel as attachments. */
export function mediaLine(url: string, filename: string, mime: string, opts: { width?: string; align?: string } = {}): string {
  const label = filename.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
  if (mime.startsWith("image/")) {
    const o = [opts.width ? `width=${opts.width}` : "", opts.align ? `align=${opts.align}` : ""].filter(Boolean).join(" ");
    return `![${label}](${url})${o ? `{${o}}` : ""}`;
  }
  return mime.startsWith("audio/") ? `@audio(${url})[${label}]` : `@file(${url})[${label}]`;
}
