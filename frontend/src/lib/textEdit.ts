// Editing rules for the writing box: indenting with Tab, and left/centre/right alignment blocks.
// A block is written as   :::center  ...lines...  :::   ("left" is simply the absence of a block).

export const ALIGN_OPEN = /^:::(left|center|right)$/;
export const ALIGN_CLOSE = /^:::$/;
export type Align = "left" | "center" | "right";

export interface Edit {
  text: string;
  start: number;
  end: number;
}

interface Lines {
  lines: string[];
  starts: number[];
}
function split(text: string): Lines {
  const lines = text.split("\n");
  const starts: number[] = [];
  let o = 0;
  for (const l of lines) {
    starts.push(o);
    o += l.length + 1;
  }
  return { lines, starts };
}
const lineAt = (L: Lines, pos: number) => {
  let i = L.starts.length - 1;
  while (i > 0 && L.starts[i] > pos) i--;
  return i;
};

// ------------------------------------------------------------------ Tab / Shift+Tab

/** Tab indents (inserting a tab, or indenting every selected line); Shift+Tab takes one level off. */
export function indent(text: string, start: number, end: number, outdent: boolean): Edit {
  const L = split(text);
  const multi = text.slice(start, end).includes("\n");
  if (!outdent && !multi) return { text: text.slice(0, start) + "\t" + text.slice(end), start: start + 1, end: start + 1 };

  const first = lineAt(L, start);
  let last = lineAt(L, end);
  if (end > start && L.starts[last] === end && last > first) last--; // a selection that ends at the very start of a line doesn't include that line
  let delta = 0;
  let firstDelta = 0;
  const out = L.lines.slice();
  for (let i = first; i <= last; i++) {
    const line = out[i];
    let next = line;
    if (outdent) next = line.startsWith("\t") ? line.slice(1) : line.replace(/^ {1,4}/, "");
    else if (line.length > 0) next = "\t" + line;
    out[i] = next;
    if (i === first) firstDelta = next.length - line.length;
    delta += next.length - line.length;
  }
  const t = out.join("\n");
  const ls = L.starts[first];
  return { text: t, start: Math.max(ls, start + firstDelta), end: Math.max(Math.max(ls, start + firstDelta), end + delta) };
}

// -------------------------------------------------------------------- alignment

interface Block {
  open: number;
  close: number; // -1 if never closed
}

/** The alignment block the line is inside (or is a marker of), if any. */
function blockAround(L: Lines, lineIdx: number): Block | null {
  let open = -1;
  for (let i = lineIdx; i >= 0; i--) {
    if (ALIGN_OPEN.test(L.lines[i])) {
      open = i;
      break;
    }
    if (ALIGN_CLOSE.test(L.lines[i]) && i !== lineIdx) return null; // walked past the end of another block
    if (ALIGN_CLOSE.test(L.lines[i]) && i === lineIdx) {
      // this line closes a block: find its opening above
      for (let j = i - 1; j >= 0; j--) {
        if (ALIGN_OPEN.test(L.lines[j])) return { open: j, close: i };
        if (ALIGN_CLOSE.test(L.lines[j])) return null;
      }
      return null;
    }
  }
  if (open === -1) return null;
  for (let j = Math.max(open + 1, lineIdx === open ? open + 1 : lineIdx); j < L.lines.length; j++) {
    if (ALIGN_CLOSE.test(L.lines[j])) return { open, close: j };
    if (ALIGN_OPEN.test(L.lines[j]) && j > lineIdx) return { open, close: -1 };
  }
  return { open, close: -1 };
}

/** The alignment that applies at a position ("left" when not inside a block). */
export function alignmentAt(text: string, pos: number): Align {
  const L = split(text);
  const b = blockAround(L, lineAt(L, pos));
  return b ? (L.lines[b.open].slice(3) as Align) : "left";
}

/** Sets the alignment of the selected lines (or of the paragraph the cursor is in). */
export function setAlignment(text: string, start: number, end: number, align: Align): Edit {
  const L = split(text);
  const sl = lineAt(L, start);
  let block = blockAround(L, sl);
  // the last line the selection touches (one that ends exactly at the start of a line doesn't include that line)
  let el = lineAt(L, end);
  if (end > start && L.starts[el] === end && el > sl) el--;
  // a selection that begins inside a block but runs past its end isn't "just this block": it is handled as a range, below
  if (block && block.close !== -1 && el > block.close) block = null;
  const rebuild = (lines: string[], s: number, e: number): Edit => ({ text: lines.join("\n"), start: s, end: e });

  if (block) {
    const lines = L.lines.slice();
    const innerStart = L.starts[block.open + 1] ?? text.length;
    if (align === "left") {
      // take the block's markers away; the text keeps its place
      const removedOpen = L.lines[block.open].length + 1;
      let close = block.close;
      if (close !== -1) lines.splice(close, 1);
      lines.splice(block.open, 1);
      return rebuild(lines, Math.max(L.starts[block.open], start - removedOpen), Math.max(L.starts[block.open], end - removedOpen));
    }
    lines[block.open] = `:::${align}`;
    const diff = `:::${align}`.length - L.lines[block.open].length;
    return rebuild(lines, start >= innerStart ? start + diff : start, end >= innerStart ? end + diff : end);
  }
  // a range: wrap the selected lines, or the paragraph (the run of non-blank lines) around the cursor
  let a = sl;
  let b = el;
  if (start === end) {
    if (L.lines[a].trim() === "") return { text, start, end };
    while (a > 0 && L.lines[a - 1].trim() !== "" && !ALIGN_OPEN.test(L.lines[a - 1]) && !ALIGN_CLOSE.test(L.lines[a - 1])) a--;
    while (b < L.lines.length - 1 && L.lines[b + 1].trim() !== "" && !ALIGN_OPEN.test(L.lines[b + 1]) && !ALIGN_CLOSE.test(L.lines[b + 1])) b++;
  }
  // a selection that touches parts of other blocks: take the whole of those blocks, flatten them, and wrap everything once
  for (let guard = 0; guard < 8; guard++) {
    let grew = false;
    for (let i = a; i <= b; i++) {
      const bl = ALIGN_OPEN.test(L.lines[i]) || ALIGN_CLOSE.test(L.lines[i]) ? blockAround(L, i) : null;
      if (bl) {
        if (bl.open < a) {
          a = bl.open;
          grew = true;
        }
        if (bl.close > b) {
          b = bl.close;
          grew = true;
        }
      }
    }
    if (!grew) break;
  }
  const inner = L.lines.slice(a, b + 1).filter((l) => !ALIGN_OPEN.test(l) && !ALIGN_CLOSE.test(l));
  if (align === "left") {
    // "left" is the absence of a block: flatten whatever blocks the range touched
    const flat = [...L.lines.slice(0, a), ...inner, ...L.lines.slice(b + 1)];
    return rebuild(flat, L.starts[a], L.starts[a] + inner.join("\n").length);
  }
  const lines = [...L.lines.slice(0, a), `:::${align}`, ...inner, ":::", ...L.lines.slice(b + 1)];
  const innerFrom = L.starts[a] + `:::${align}`.length + 1;
  return rebuild(lines, innerFrom, innerFrom + inner.join("\n").length);
}
