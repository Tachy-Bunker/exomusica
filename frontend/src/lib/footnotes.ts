// Footnote markers look like [3] in the markdown source. Everything here is
// pure string logic (plus one DOM walker) so it can be tested without a UI.
//
// The core problem: the user drops a note onto a WORD IN THE RENDERED
// PREVIEW, but the marker has to be inserted into the markdown SOURCE.
// Rather than threading source offsets through the renderer, both sides are
// tokenized into words the same way, with source-only syntax (link URLs,
// list numbers, fence lines, embed lines) excluded. The Kth "foo" in the
// preview is then the Kth "foo" in the source.

import { CLIP_RE_GLOBAL } from "./clips";

export const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const WORD_CHAR = /[\p{L}\p{N}'’-]/u;
const MARKER_RE = /\[(\d+)\](?!\()/g; // [3] but not the start of a [text](url) link
const FIGURE_REF_RE = /\{(fig|tab):(\d+)\}/g; // {fig:2} / {tab:1}

export interface Token {
  text: string;
  start: number;
  end: number;
}

type Range2 = [number, number];

function inAny(ranges: Range2[], i: number): boolean {
  for (const [a, b] of ranges) if (i >= a && i < b) return true;
  return false;
}

/** Fenced code blocks (fence lines included) and inline `code` spans. */
function codeRanges(source: string): Range2[] {
  const ranges: Range2[] = [];
  let offset = 0;
  let fenceStart = -1;
  for (const line of source.split("\n")) {
    if (/^```/.test(line)) {
      if (fenceStart === -1) fenceStart = offset;
      else {
        ranges.push([fenceStart, offset + line.length]);
        fenceStart = -1;
      }
    }
    offset += line.length + 1;
  }
  if (fenceStart !== -1) ranges.push([fenceStart, source.length]); // unterminated fence runs to the end
  for (const m of source.matchAll(/`[^`\n]+`/g)) {
    if (m.index !== undefined && !inAny(ranges, m.index)) ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

/** Parts of the source that never show up as visible text in the preview. */
function hiddenRanges(source: string): Range2[] {
  const ranges: Range2[] = [];
  let offset = 0;
  let inFence = false;
  const fenceInner: Range2[] = [];
  let fenceInnerStart = 0;
  for (const line of source.split("\n")) {
    const end = offset + line.length;
    if (/^```/.test(line)) {
      ranges.push([offset, end]); // the fence line itself (incl. language tag) isn't rendered
      if (!inFence) fenceInnerStart = end + 1;
      else fenceInner.push([fenceInnerStart, offset]);
      inFence = !inFence;
    } else if (!inFence) {
      if (/^(!\[.*?\]\(\S+\)(?:\{[^{}]*\})?|@audio\(\S+\)|@video\(\S+\)|@file\(\S+\)(?:\[.*?\])?|:::(?:left|center|right)?|\{(?:fig|tab):\d+\})$/.test(line)) {
        ranges.push([offset, end]); // image/audio/video/file/figure embeds and :::alignment markers render no word-text we can cite
      } else {
        const ordered = line.match(/^\d+[.)]\s/);
        if (ordered) ranges.push([offset, offset + ordered[0].length]); // "1. " is list numbering, drawn by CSS
      }
    }
    offset = end + 1;
  }
  if (inFence) fenceInner.push([fenceInnerStart, source.length]);
  for (const m of source.matchAll(/\]\((https?:\/\/[^\s)]+)\)/g)) {
    if (m.index !== undefined && !inAny(fenceInner, m.index)) ranges.push([m.index + 1, m.index + m[0].length]);
  }
  const code = codeRanges(source); // {fig:1} inside code is literal text, so it stays citable
  for (const m of source.matchAll(FIGURE_REF_RE)) {
    if (m.index !== undefined && !inAny(code, m.index)) ranges.push([m.index, m.index + m[0].length]);
  }
  for (const m of source.matchAll(CLIP_RE_GLOBAL)) {
    // {clip:...} renders as a play button (data-nocite), so its characters aren't citable words
    if (m.index !== undefined && !inAny(code, m.index)) ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

export function sourceTokens(source: string): Token[] {
  const hidden = hiddenRanges(source);
  const out: Token[] = [];
  for (const m of source.matchAll(WORD_RE)) {
    if (m.index === undefined || inAny(hidden, m.index)) continue;
    out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** End offset of the Kth (0-based) source word equal to `word`, or null. */
export function sourceInsertOffset(source: string, word: string, occurrence: number): number | null {
  let seen = 0;
  for (const t of sourceTokens(source)) {
    if (t.text !== word) continue;
    if (seen === occurrence) return t.end;
    seen++;
  }
  return null;
}

export function insertMarker(source: string, offset: number, n: number): string {
  return source.slice(0, offset) + `[${n}]` + source.slice(offset);
}

/**
 * A marker was just dropped into the textarea natively, at wherever the
 * caret happened to be under the pointer. If that's inside (or at the left
 * edge of) a word, move it to the end of the word so citations always sit
 * after the thing they cite. Returns null if the edit isn't a clean
 * single insertion of `marker` (then the caller leaves it alone).
 */
export function snapDroppedMarker(oldBody: string, newBody: string, marker: string): string | null {
  if (newBody.length !== oldBody.length + marker.length) return null;
  let i = 0;
  while (i < oldBody.length && oldBody[i] === newBody[i]) i++;
  if (newBody.slice(i, i + marker.length) !== marker) return null;
  if (newBody.slice(0, i) + newBody.slice(i + marker.length) !== oldBody) return null;
  let j = i;
  while (j < oldBody.length && WORD_CHAR.test(oldBody[j])) j++;
  return oldBody.slice(0, j) + marker + oldBody.slice(j);
}

/**
 * Rewrite every [n] marker (outside code). `map` returns the new number,
 * or null to remove the marker. Used when notes are reordered or deleted
 * so the markers keep pointing at the same notes.
 */
export function remapMarkers(body: string, map: (n: number) => number | null): string {
  const code = codeRanges(body);
  return body.replace(MARKER_RE, (match, digits: string, offset: number) => {
    if (inAny(code, offset)) return match;
    const n = Number(digits);
    const to = map(n);
    if (to === null) return "";
    return to === n ? match : `[${to}]`;
  });
}

export function noteDeletionMap(deletedNumber: number, noteCount: number) {
  return (n: number): number | null => {
    if (n > noteCount) return n; // not a footnote - something like [2024]
    if (n === deletedNumber) return null;
    return n > deletedNumber ? n - 1 : n;
  };
}

export function noteSwapMap(a: number, b: number, noteCount: number) {
  return (n: number): number | null => {
    if (n > noteCount) return n;
    if (n === a) return b;
    if (n === b) return a;
    return n;
  };
}

// ---------------------------------------------------------------- DOM side

export interface DomToken extends Token {
  node: Text;
}

/** Figures and "Figure 2" links carry data-nocite: their words don't exist in the source text. */
function isUncitable(node: Node): boolean {
  return !!node.parentElement?.closest("[data-nocite]");
}

/** Words of the rendered preview, per text node, in document order. */
export function previewTokens(root: HTMLElement): DomToken[] {
  const out: DomToken[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (isUncitable(node)) continue;
    for (const m of node.data.matchAll(WORD_RE)) {
      if (m.index === undefined) continue;
      out.push({ text: m[0], start: m.index, end: m.index + m[0].length, node });
    }
  }
  return out;
}

function caretFromPoint(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as unknown as {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    return p ? { node: p.offsetNode, offset: p.offset } : null;
  }
  const r = doc.caretRangeFromPoint?.(x, y);
  return r ? { node: r.startContainer, offset: r.startOffset } : null;
}

/** The preview word actually under the pointer (not merely the nearest text). */
export function wordAtPoint(root: HTMLElement, x: number, y: number): { token: DomToken; range: Range } | null {
  const caret = caretFromPoint(x, y);
  if (!caret || caret.node.nodeType !== Node.TEXT_NODE || !root.contains(caret.node) || isUncitable(caret.node)) return null;
  const node = caret.node as Text;
  for (const m of node.data.matchAll(WORD_RE)) {
    if (m.index === undefined) continue;
    const start = m.index;
    const end = start + m[0].length;
    if (caret.offset < start || caret.offset > end) continue;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    // The caret APIs snap to the nearest text even from far away; require
    // the pointer to genuinely be over the word.
    const over = Array.from(range.getClientRects()).some((r) => x >= r.left - 3 && x <= r.right + 3 && y >= r.top - 3 && y <= r.bottom + 3);
    if (!over) return null;
    return { token: { text: m[0], start, end, node }, range };
  }
  return null;
}

/** Where in the markdown source a word picked in the preview lives. */
export function sourceOffsetForPreviewWord(root: HTMLElement, source: string, hit: DomToken): number | null {
  const toks = previewTokens(root);
  const idx = toks.findIndex((t) => t.node === hit.node && t.start === hit.start);
  if (idx === -1) return null;
  let occurrence = 0;
  for (let i = 0; i < idx; i++) if (toks[i].text === hit.text) occurrence++;
  return sourceInsertOffset(source, hit.text, occurrence);
}

// ------------------------------------------------------------------ figures

export type FigureKind = "fig" | "tab";

/** Rewrite {fig:N}/{tab:N} references (outside code). Return null to remove one. */
export function remapFigureRefs(body: string, map: (kind: FigureKind, n: number) => { kind: FigureKind; n: number } | null): string {
  const code = codeRanges(body);
  return body.replace(FIGURE_REF_RE, (match, kind: FigureKind, digits: string, offset: number) => {
    if (inAny(code, offset)) return match;
    const to = map(kind, Number(digits));
    return to === null ? "" : `{${to.kind}:${to.n}}`;
  });
}

/** Which figures/tables are placed inline, as "fig:2" / "tab:1" (only block-level placements count). */
export function findPlacedFigures(body: string): Set<string> {
  const placed = new Set<string>();
  let inFence = false;
  for (const line of body.split("\n")) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^\{(fig|tab):(\d+)\}$/);
    if (m) placed.add(`${m[1]}:${Number(m[2])}`);
  }
  return placed;
}

/**
 * Inserts a figure token on its own paragraph - after the line containing
 * `offset`, with a blank line either side, which is what the renderer needs
 * to treat it as a block.
 */
export function insertFigureBlock(body: string, offset: number, token: string): string {
  const nl = body.indexOf("\n", offset);
  const j = nl === -1 ? body.length : nl;
  let head = body.slice(0, j);
  let tail = body.slice(j);
  if (head.length > 0) {
    const trailing = head.match(/\n*$/)![0].length;
    head += "\n".repeat(Math.max(0, 2 - trailing)); // need a blank line before the figure
  }
  if (tail.length === 0) tail = "\n";
  else {
    const lead = tail.match(/^\n*/)![0].length;
    if (lead < 2) tail = "\n".repeat(2 - lead) + tail;
  }
  return head + token + tail;
}

/** A figure token dropped natively into the textarea mid-text: move it onto its own paragraph. */
export function snapDroppedBlock(oldBody: string, newBody: string, token: string): string | null {
  if (newBody.length !== oldBody.length + token.length) return null;
  let i = 0;
  while (i < oldBody.length && oldBody[i] === newBody[i]) i++;
  if (newBody.slice(i, i + token.length) !== token) return null;
  if (newBody.slice(0, i) + newBody.slice(i + token.length) !== oldBody) return null;
  return insertFigureBlock(oldBody, i, token);
}
