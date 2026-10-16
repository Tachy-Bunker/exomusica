// An inscription can name a page of the Log, XenoLab or the news as [label](/wiki/slug). In the room it opens that page in the room's terminal.
// Only a link the terminal can show is a link; any other [text](/path) is plain text. Pure, so the room and the tests use the same rule.
import { terminalAllows } from "./terminal";

const LINK = /\[([^\]\n]{1,80})\]\((\/[^\s()]{1,200})\)/g;

export type InscriptionPart = { text: string } | { label: string; path: string };

/** The inscription split into plain text and links, in order. */
export function inscriptionParts(text: string, room: string): InscriptionPart[] {
  const out: InscriptionPart[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    const [whole, label, path] = m, at = m.index ?? 0;
    if (!terminalAllows(path, { room, albums: [] })) continue; // not something the terminal shows: it stays as written
    if (at > last) out.push({ text: text.slice(last, at) });
    out.push({ label, path });
    last = at + whole.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** The inscription as one line of plain text (links shown by their label). */
export function inscriptionPlain(text: string, room: string): string {
  return inscriptionParts(text, room).map((p) => ("text" in p ? p.text : p.label)).join("");
}
