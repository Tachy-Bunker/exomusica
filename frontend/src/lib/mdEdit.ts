/** Toolbar actions for the markdown boxes: pure functions on (text, selection) so they test without a DOM and cost nothing at idle. */
export type MdKind = "bold" | "italic" | "strike" | "code" | "spoiler" | "codeblock" | "ul" | "ol" | "quote" | "head" | "link" | "hr";
export interface Edit { value: string; start: number; end: number }

const WRAP: Partial<Record<MdKind, [string, string, string]>> = {
  bold: ["**", "**", "bold"], italic: ["*", "*", "italic"], strike: ["~~", "~~", "struck"], code: ["`", "`", "code"], spoiler: ["|", "|", "spoiler"],
};

export function applyMd(value: string, start: number, end: number, kind: MdKind): Edit {
  const sel = value.slice(start, end);
  const w = WRAP[kind];
  if (w) {
    const [a, b, ph] = w;
    if (sel && value.slice(start - a.length, start) === a && value.slice(end, end + b.length) === b) // already wrapped: take it off
      return { value: value.slice(0, start - a.length) + sel + value.slice(end + b.length), start: start - a.length, end: end - a.length };
    const body = sel || ph;
    return { value: value.slice(0, start) + a + body + b + value.slice(end), start: start + a.length, end: start + a.length + body.length };
  }
  if (kind === "link") {
    const text = sel || "text", url = /^https?:\/\/\S+$/.test(sel) ? sel : "https://";
    const label = /^https?:\/\/\S+$/.test(sel) ? "link" : text;
    const md = `[${label}](${url})`;
    const urlStart = start + label.length + 3;
    return /^https?:\/\/\S+$/.test(sel)
      ? { value: value.slice(0, start) + md + value.slice(end), start: start + 1, end: start + 1 + label.length }
      : { value: value.slice(0, start) + md + value.slice(end), start: urlStart, end: urlStart + url.length };
  }
  if (kind === "codeblock") {
    const body = sel || "code", nl = start > 0 && value[start - 1] !== "\n" ? "\n" : "";
    const pre = nl + "```\n";
    return { value: value.slice(0, start) + pre + body + "\n```\n" + value.slice(end), start: start + pre.length, end: start + pre.length + body.length };
  }
  if (kind === "hr") {
    const nl = start > 0 && value[start - 1] !== "\n" ? "\n" : "";
    const ins = nl + "---\n"; return { value: value.slice(0, start) + ins + value.slice(end), start: start + ins.length, end: start + ins.length };
  }
  // line prefixes act on every line the selection touches
  const ls = value.lastIndexOf("\n", start - 1) + 1;
  const le0 = value.indexOf("\n", end); const le = le0 === -1 ? value.length : le0;
  const lines = value.slice(ls, le).split("\n");
  const pre = (i: number) => (kind === "ul" ? "- " : kind === "ol" ? `${i + 1}. ` : kind === "quote" ? "> " : "## ");
  const has = (l: string) => (kind === "ul" ? /^- /.test(l) : kind === "ol" ? /^\d+\. /.test(l) : kind === "quote" ? /^> /.test(l) : /^## /.test(l));
  const strip = (l: string) => l.replace(kind === "ul" ? /^- / : kind === "ol" ? /^\d+\. / : kind === "quote" ? /^> / : /^## /, "");
  const all = lines.every(has);
  const out = lines.map((l, i) => (all ? strip(l) : has(l) ? l : pre(i) + l)).join("\n");
  return { value: value.slice(0, ls) + out + value.slice(le), start: ls, end: ls + out.length };
}
