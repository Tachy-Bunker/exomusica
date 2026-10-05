// Text diff for revision history: line-level first (cheap, robust), then
// word-level inside replaced blocks - in prose a "changed line" is a whole
// paragraph, so line-level alone would just say "everything changed".

export interface DiffSegment {
  type: "same" | "add" | "del";
  text: string;
}

type Op<T> = { type: "same" | "del" | "add"; items: T[] };

// Above this many table cells the exact diff is too slow/heavy for a weak
// device, so the changed middle is shown as one removal + one addition.
const CELL_LIMIT = 4_000_000;

function mergeOps<T>(ops: Op<T>[]): Op<T>[] {
  const out: Op<T>[] = [];
  for (const op of ops) {
    if (op.items.length === 0) continue;
    const last = out[out.length - 1];
    if (last && last.type === op.type) last.items = last.items.concat(op.items);
    else out.push({ type: op.type, items: [...op.items] });
  }
  return out;
}

function diffMiddle<T>(a: T[], b: T[]): Op<T>[] {
  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) return [{ type: "add", items: b }];
  if (b.length === 0) return [{ type: "del", items: a }];
  if (a.length * b.length > CELL_LIMIT) return [{ type: "del", items: a }, { type: "add", items: b }];

  const n = a.length;
  const m = b.length;
  const W = m + 1;
  const table = n < 65535 && m < 65535 ? new Uint16Array((n + 1) * W) : new Uint32Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * W + j] = a[i] === b[j] ? table[(i + 1) * W + j + 1] + 1 : Math.max(table[(i + 1) * W + j], table[i * W + j + 1]);
    }
  }
  const ops: Op<T>[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "same", items: [a[i]] });
      i++;
      j++;
    } else if (table[(i + 1) * W + j] >= table[i * W + j + 1]) {
      ops.push({ type: "del", items: [a[i++]] });
    } else {
      ops.push({ type: "add", items: [b[j++]] });
    }
  }
  while (i < n) ops.push({ type: "del", items: [a[i++]] });
  while (j < m) ops.push({ type: "add", items: [b[j++]] });
  return ops;
}

function diffArrays<T>(a: T[], b: T[]): Op<T>[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  return mergeOps<T>([
    { type: "same", items: a.slice(0, start) },
    ...diffMiddle(a.slice(start, endA), b.slice(start, endB)),
    { type: "same", items: a.slice(endA) },
  ]);
}

const withTrailingNewline = (t: string) => (t.endsWith("\n") ? t : t + "\n");
const toLines = (t: string): string[] => withTrailingNewline(t).match(/[^\n]*\n/g) ?? [];
const toWords = (t: string): string[] => t.match(/\s+|\S+/g) ?? [];

function mergeSegments(segs: DiffSegment[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (const s of segs) {
    if (!s.text) continue;
    const last = out[out.length - 1];
    if (last && last.type === s.type) last.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

/** Differences from `oldText` to `newText`. Both are treated as ending in a newline. */
export function diffText(oldText: string, newText: string): DiffSegment[] {
  const ops = diffArrays(toLines(oldText), toLines(newText));
  const segs: DiffSegment[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.type === "same") {
      segs.push({ type: "same", text: op.items.join("") });
    } else if (op.type === "del" && ops[i + 1]?.type === "add") {
      // a replaced block: show exactly which words changed inside it
      const words = diffArrays(toWords(op.items.join("")), toWords(ops[i + 1].items.join("")));
      for (const w of words) segs.push({ type: w.type, text: w.items.join("") });
      i++;
    } else {
      segs.push({ type: op.type, text: op.items.join("") });
    }
  }
  return mergeSegments(segs);
}

export function diffStats(segments: DiffSegment[]): { added: number; removed: number } {
  const count = (t: string) => t.split(/\s+/).filter(Boolean).length;
  let added = 0;
  let removed = 0;
  for (const s of segments) {
    if (s.type === "add") added += count(s.text);
    else if (s.type === "del") removed += count(s.text);
  }
  return { added, removed };
}
