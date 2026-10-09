/** Block-level markdown for messages and letters' text: fenced code, lists, rules, headings. Pure, so it tests without a DOM. Everything else stays line by line (Discord habits keep working). */
export type Block =
  | { t: "code"; lang: string; text: string }
  | { t: "list"; ordered: boolean; items: string[] }
  | { t: "hr" }
  | { t: "head"; level: 1 | 2 | 3; text: string }
  | { t: "small"; text: string }
  | { t: "quote"; text: string }
  | { t: "blank" }
  | { t: "line"; text: string };

const UL = /^\s{0,3}[-*+] (?!#)(.*)$/;
const OL = /^\s{0,3}\d{1,3}[.)] (.*)$/;
const AUDIO = /\.(mp3|ogg|oga|opus|wav|flac|m4a)(\?[^\s]*)?$/i;
export const isAudioUrl = (u: string): boolean => AUDIO.test(u);
/** Only pictures that live on this site are drawn inline: a remote image would tell its host who read the message. */
export const isLocalImage = (u: string, origin: string): boolean => u.startsWith("/uploads/") || u.startsWith(`${origin}/uploads/`);

export function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^```\s*([\w+-]{0,20})\s*$/.exec(line);
    if (fence) {
      let j = i + 1; const buf: string[] = [];
      while (j < lines.length && !/^```\s*$/.test(lines[j])) buf.push(lines[j++]);
      if (j < lines.length || buf.length) { out.push({ t: "code", lang: fence[1], text: buf.join("\n") }); i = j; continue; }
    }
    if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push({ t: "hr" }); continue; }
    const h = /^(#{1,3}) (.+)$/.exec(line);
    if (h) { out.push({ t: "head", level: h[1].length as 1 | 2 | 3, text: h[2] }); continue; }
    if (line.startsWith("-# ")) { out.push({ t: "small", text: line.slice(3) }); continue; }
    if (line.startsWith("> ")) { out.push({ t: "quote", text: line.slice(2) }); continue; }
    const ul = UL.exec(line), ol = ul ? null : OL.exec(line);
    if (ul || ol) {
      const ordered = !!ol, re = ordered ? OL : UL; const items: string[] = [];
      let j = i;
      while (j < lines.length) { const m = re.exec(lines[j]); if (!m) break; items.push(m[1]); j++; }
      out.push({ t: "list", ordered, items }); i = j - 1; continue;
    }
    out.push(line.trim() === "" ? { t: "blank" } : { t: "line", text: line });
  }
  return out;
}
