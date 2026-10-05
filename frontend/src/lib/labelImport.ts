// Turns label/marker files from audio tools into cited clips. Pure text parsing
// (no DOM), so it's tested directly against realistic exports.
//
// Understood: Audacity label tracks (.txt), REAPER / Adobe Audition marker lists
// and any other delimited table with start/end/label columns (.csv/.tsv), and
// Praat TextGrids (long and short text formats) - the standard in phonetics.

export interface ImportedLabel {
  start: number;
  /** null = a point marker (no duration). */
  end: number | null;
  text: string;
}

export type LabelFormat = "audacity" | "table" | "textgrid";

export interface ParsedLabels {
  format: LabelFormat;
  labels: ImportedLabel[];
  /** TextGrid only: the names of its tiers, and which one `labels` came from. */
  tiers: string[];
  tier: string | null;
  warnings: string[];
}

/** "12.5", "12,5", "1:02.5", "0:01:02.500", "12.5s" -> seconds, or null if it isn't a time. */
export function parseTime(raw: string): number | null {
  let s = raw.trim().replace(/s$/i, "");
  if (!s) return null;
  if (!s.includes(":") && /^\d+,\d+$/.test(s)) s = s.replace(",", "."); // decimal comma
  const parts = s.split(":");
  if (parts.length > 3) return null;
  let total = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].replace(",", ".");
    if (!/^\d+(\.\d+)?$|^\.\d+$/.test(p)) return null;
    if (i < parts.length - 1 && p.includes(".")) return null; // only the last part (seconds) may be fractional
    total = total * 60 + Number(p);
  }
  return total;
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

/** One line of delimited text, honouring "quoted, fields" and "" escapes. */
function splitDelimited(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export function detectFormat(text: string): LabelFormat | null {
  const t = stripBom(text);
  if (/File type\s*=\s*"ooTextFile"/i.test(t) || (/^"ooTextFile"/m.test(t) && /"TextGrid"/.test(t))) return "textgrid";
  const lines = t.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return null;
  const firstData = lines.find((l) => !l.startsWith("\\")) ?? "";
  const cols = firstData.split("\t");
  if (cols.length >= 2 && parseTime(cols[0]) !== null && parseTime(cols[1]) !== null) return "audacity"; // numbers first, no header
  return "table";
}

// ---------------------------------------------------------------- Audacity

function parseAudacity(text: string): ParsedLabels {
  const labels: ImportedLabel[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (line.startsWith("\\")) continue; // spectral-selection (frequency) range belonging to the previous label
    const cols = line.split("\t");
    const start = parseTime(cols[0] ?? "");
    const end = parseTime(cols[1] ?? "");
    if (start === null || end === null) {
      skipped++;
      continue;
    }
    labels.push({ start, end: end > start ? end : null, text: (cols.slice(2).join(" ") || "").trim() });
  }
  if (skipped) warnings.push(`${skipped} line${skipped === 1 ? "" : "s"} couldn't be read and were skipped`);
  return { format: "audacity", labels, tiers: [], tier: null, warnings };
}

// ------------------------------------------------------- delimited tables

const START_NAMES = ["start", "begin", "onset", "time", "position", "in", "start time", "starttime"];
const END_NAMES = ["end", "offset", "stop", "out", "end time", "endtime"];
const DURATION_NAMES = ["duration", "length", "dur"];
const LABEL_NAMES = ["name", "label", "text", "description", "comment", "marker", "title", "annotation"];

function pickDelimiter(headerLine: string): string {
  const counts = { "\t": 0, ",": 0, ";": 0 } as Record<string, number>;
  for (const ch of headerLine) if (ch in counts) counts[ch]++;
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0 ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : "\t");
}

function parseTable(text: string): ParsedLabels {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const warnings: string[] = [];
  const labels: ImportedLabel[] = [];
  if (lines.length === 0) return { format: "table", labels, tiers: [], tier: null, warnings };
  const delimiter = pickDelimiter(lines[0]);
  const rows = lines.map((l) => splitDelimited(l, delimiter).map((c) => c.trim()));
  const head = rows[0].map((c) => c.toLowerCase().replace(/^#$/, ""));
  const known = [...START_NAMES, ...END_NAMES, ...DURATION_NAMES, ...LABEL_NAMES];
  const hasHeader = head.some((h) => known.includes(h));
  let iStart = -1;
  let iEnd = -1;
  let iDur = -1;
  let iLabel = -1;
  let body = rows;
  if (hasHeader) {
    iStart = head.findIndex((h) => START_NAMES.includes(h));
    iEnd = head.findIndex((h) => END_NAMES.includes(h));
    iDur = head.findIndex((h) => DURATION_NAMES.includes(h));
    iLabel = head.findIndex((h) => LABEL_NAMES.includes(h));
    body = rows.slice(1);
    if (iStart === -1) {
      warnings.push("Couldn't find a start-time column");
      return { format: "table", labels, tiers: [], tier: null, warnings };
    }
  } else {
    // no header: numbers first. start,end,label  or  time,label
    iStart = 0;
    if (parseTime(rows[0][1] ?? "") !== null && (rows[0].length >= 2)) {
      iEnd = 1;
      iLabel = rows[0].length > 2 ? 2 : -1;
    } else {
      iLabel = rows[0].length > 1 ? 1 : -1;
    }
  }
  let skipped = 0;
  for (const r of body) {
    const start = parseTime(r[iStart] ?? "");
    if (start === null) {
      skipped++;
      continue;
    }
    let end: number | null = null;
    const e = iEnd >= 0 ? parseTime(r[iEnd] ?? "") : null;
    const d = iDur >= 0 ? parseTime(r[iDur] ?? "") : null;
    if (e !== null && e > start) end = e;
    else if (d !== null && d > 0) end = start + d;
    labels.push({ start, end, text: iLabel >= 0 ? (r[iLabel] ?? "").trim() : "" });
  }
  // Only worth explaining if this really looks like a marker table; for arbitrary text that's just noise.
  if (skipped && (labels.length > 0 || hasHeader)) warnings.push(`${skipped} row${skipped === 1 ? "" : "s"} had a time that couldn't be read (project time formats like bars/beats aren't supported - export in seconds or h:mm:ss) and were skipped`);
  return { format: "table", labels, tiers: [], tier: null, warnings };
}

// ------------------------------------------------------------ Praat TextGrid

interface Tier {
  name: string;
  kind: "interval" | "point";
  entries: { start: number; end: number | null; text: string }[];
}

const unquote = (s: string) => s.replace(/^"|"$/g, "").replace(/""/g, '"');

function parseTextGridLong(text: string): Tier[] {
  const tiers: Tier[] = [];
  const blocks = text.split(/^\s*item \[\d+\]:/m).slice(1);
  for (const block of blocks) {
    const cls = block.match(/class\s*=\s*"([^"]*)"/)?.[1] ?? "";
    const name = unquote(block.match(/name\s*=\s*("(?:[^"]|"")*")/)?.[1] ?? '""');
    const entries: Tier["entries"] = [];
    if (/Interval/i.test(cls)) {
      for (const m of block.matchAll(/xmin\s*=\s*([\d.eE+-]+)\s*xmax\s*=\s*([\d.eE+-]+)\s*text\s*=\s*("(?:[^"]|"")*")/g)) {
        entries.push({ start: Number(m[1]), end: Number(m[2]), text: unquote(m[3]).trim() });
      }
      tiers.push({ name, kind: "interval", entries });
    } else {
      for (const m of block.matchAll(/(?:number|time)\s*=\s*([\d.eE+-]+)\s*(?:mark|text)\s*=\s*("(?:[^"]|"")*")/g)) {
        entries.push({ start: Number(m[1]), end: null, text: unquote(m[2]).trim() });
      }
      tiers.push({ name, kind: "point", entries });
    }
  }
  return tiers;
}

function parseTextGridShort(text: string): Tier[] {
  // Praat's short format opens with "File type = ..." / "Object class = ..." lines (plain text), then just values.
  const body = text.replace(/^\s*File type\s*=.*$/im, "").replace(/^\s*Object class\s*=.*$/im, "");
  const tokens = body.match(/"(?:[^"]|"")*"|\S+/g) ?? [];
  let i = tokens[0] === '"ooTextFile"' ? 2 : 0; // some writers quote the two header values instead
  const next = () => tokens[i++];
  next(); // xmin
  next(); // xmax
  next(); // <exists>
  const size = Number(next());
  const tiers: Tier[] = [];
  for (let t = 0; t < size; t++) {
    const cls = unquote(next() ?? "");
    const name = unquote(next() ?? "");
    next(); // tier xmin
    next(); // tier xmax
    const count = Number(next());
    const entries: Tier["entries"] = [];
    const interval = /Interval/i.test(cls);
    for (let k = 0; k < count; k++) {
      if (interval) {
        const start = Number(next());
        const end = Number(next());
        entries.push({ start, end, text: unquote(next() ?? "").trim() });
      } else {
        const start = Number(next());
        entries.push({ start, end: null, text: unquote(next() ?? "").trim() });
      }
    }
    tiers.push({ name, kind: interval ? "interval" : "point", entries });
  }
  return tiers;
}

function parseTextGrid(text: string, wantedTier?: string): ParsedLabels {
  const warnings: string[] = [];
  const long = /item \[\d+\]:/.test(text);
  let tiers: Tier[] = [];
  try {
    tiers = long ? parseTextGridLong(text) : parseTextGridShort(text);
  } catch {
    warnings.push("This TextGrid couldn't be read");
  }
  const names = tiers.map((t) => t.name);
  const usable = (t: Tier) => t.entries.some((e) => e.text !== "");
  const chosen = tiers.find((t) => t.name === wantedTier) ?? tiers.find(usable) ?? tiers[0];
  const labels: ImportedLabel[] = [];
  let blanks = 0;
  for (const e of chosen?.entries ?? []) {
    if (e.text === "") {
      blanks++; // silence / unlabelled stretches
      continue;
    }
    if (!Number.isFinite(e.start) || (e.end !== null && !Number.isFinite(e.end))) continue;
    labels.push({ start: e.start, end: e.end !== null && e.end > e.start ? e.end : null, text: e.text });
  }
  if (blanks) warnings.push(`${blanks} unlabelled interval${blanks === 1 ? "" : "s"} left out`);
  return { format: "textgrid", labels, tiers: names, tier: chosen?.name ?? null, warnings };
}

// ------------------------------------------------------------------ entry

export function parseLabels(text: string, opts: { tier?: string } = {}): ParsedLabels | null {
  const t = stripBom(text);
  const format = detectFormat(t);
  if (!format) return null;
  const result = format === "textgrid" ? parseTextGrid(t, opts.tier) : format === "audacity" ? parseAudacity(t) : parseTable(t);
  result.labels.sort((a, b) => a.start - b.start);
  return result;
}

// ----------------------------------------------------- labels -> clips

export interface PlannedClip {
  start: number;
  end: number;
  text: string;
}
export interface SkippedLabel {
  label: ImportedLabel;
  reason: string;
}

export const MAX_IMPORT = 100;

/**
 * Turns labels into clips that fit inside a recording of `duration` seconds. Point markers have no length of
 * their own: they run until the next marker ("next") or for a fixed number of seconds.
 */
export function planClips(labels: ImportedLabel[], duration: number, pointLength: number | "next"): { clips: PlannedClip[]; skipped: SkippedLabel[] } {
  const sorted = [...labels].sort((a, b) => a.start - b.start);
  const clips: PlannedClip[] = [];
  const skipped: SkippedLabel[] = [];
  sorted.forEach((l, i) => {
    if (l.start >= duration) {
      skipped.push({ label: l, reason: "starts after the end of the recording" });
      return;
    }
    let end = l.end;
    if (end === null) {
      const nextStart = sorted.slice(i + 1).find((n) => n.start > l.start)?.start;
      end = pointLength === "next" ? (nextStart ?? l.start + 1) : l.start + pointLength;
    }
    end = Math.min(end, duration);
    if (end - l.start < 0.05) {
      skipped.push({ label: l, reason: "too short to play" });
      return;
    }
    if (clips.length >= MAX_IMPORT) {
      skipped.push({ label: l, reason: `over the ${MAX_IMPORT}-clip limit` });
      return;
    }
    clips.push({ start: l.start, end, text: l.text || `Clip ${clips.length + 1}` });
  });
  return { clips, skipped };
}

/**
 * Reads a label file's bytes as text. Praat writes UTF-16 whenever a label contains non-ASCII characters
 * (phonetic symbols, accents), which reading as UTF-8 would turn into garbage.
 */
export function decodeTextFile(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}
