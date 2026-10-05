export interface Heading {
  level: 1 | 2 | 3;
  /** Display text with inline markdown stripped. */
  text: string;
  /** Character offset of the heading line in the source. */
  index: number;
  /** Position among all headings - matches the id (sec-N) the renderer gives the heading. */
  ordinal: number;
}

/** # / ## / ### headings outside fenced code - exactly the lines renderMarkdown turns into headings. */
export function extractHeadings(source: string): Heading[] {
  const out: Heading[] = [];
  let offset = 0;
  let inFence = false;
  for (const line of source.split("\n")) {
    if (/^```/.test(line)) inFence = !inFence;
    else if (!inFence) {
      const m = line.match(/^(#{1,3}) (.*)$/);
      if (m) {
        const text = m[2]
          .replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]+\)/g, "$1")
          .replace(/[*`]/g, "")
          .trim();
        out.push({ level: m[1].length as 1 | 2 | 3, text: text || "(untitled)", index: offset, ordinal: out.length });
      }
    }
    offset += line.length + 1;
  }
  return out;
}

/** Source offsets of figure/table blocks placed on their own line ({fig:2}), for scroll-sync anchors. */
export function figureBlockOffsets(source: string): { kind: "fig" | "tab"; n: number; index: number }[] {
  const out: { kind: "fig" | "tab"; n: number; index: number }[] = [];
  let offset = 0;
  let inFence = false;
  for (const line of source.split("\n")) {
    if (/^```/.test(line)) inFence = !inFence;
    else if (!inFence) {
      const m = line.match(/^\{(fig|tab):(\d+)\}$/);
      if (m) out.push({ kind: m[1] as "fig" | "tab", n: Number(m[2]), index: offset });
    }
    offset += line.length + 1;
  }
  return out;
}
