// Images in a study: `![alt](url)` on its own line, optionally followed by `{width=60% align=center}`.
// Width is a percentage of the page column (it adapts to any screen) or, written without a % sign, pixels.
// Pure functions on the source text, so the same rules drive the preview, the resize handle and the tests.

export const IMAGE_LINE = /^!\[(.*?)\]\((\S+)\)(?:\{([^{}]*)\})?$/;

export type ImageAlign = "left" | "center" | "right";
export interface ImageWidth {
  value: number;
  unit: "%" | "px";
}
export interface ImageAttrs {
  width?: ImageWidth;
  /** "left" is the default and is never written out. */
  align?: ImageAlign;
}

export const MIN_PERCENT = 5;
export const MAX_PIXELS = 4000;

export function clampWidth(w: ImageWidth): ImageWidth {
  return w.unit === "%" ? { value: Math.max(MIN_PERCENT, Math.min(100, Math.round(w.value))), unit: "%" } : { value: Math.max(20, Math.min(MAX_PIXELS, Math.round(w.value))), unit: "px" };
}

export function parseImageAttrs(raw: string | undefined): ImageAttrs {
  const out: ImageAttrs = {};
  for (const part of (raw ?? "").split(/[\s,]+/)) {
    const m = part.match(/^(width|w|align)=(.+)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === "align") {
      const a = m[2].toLowerCase();
      if (a === "center" || a === "right") out.align = a;
    } else {
      const w = m[2].match(/^(\d+(?:\.\d+)?)(%|px)?$/i);
      if (w) out.width = clampWidth({ value: Number(w[1]), unit: w[2] === "%" ? "%" : "px" });
    }
  }
  return out;
}

export function formatImageAttrs(a: ImageAttrs): string {
  const parts: string[] = [];
  if (a.width) {
    const w = clampWidth(a.width);
    parts.push(`width=${w.value}${w.unit === "%" ? "%" : ""}`);
  }
  if (a.align && a.align !== "left") parts.push(`align=${a.align}`);
  return parts.length ? `{${parts.join(" ")}}` : "";
}

export const imageLine = (alt: string, url: string, attrs: ImageAttrs = {}) => `![${alt}](${url})${formatImageAttrs(attrs)}`;

export interface FoundImage {
  /** Order among the images of the text (the same order the preview draws them in). */
  index: number;
  /** Offsets of the whole line in the source. */
  start: number;
  end: number;
  alt: string;
  url: string;
  attrs: ImageAttrs;
}

/** Every image line outside fenced code, in order. */
export function findImages(source: string): FoundImage[] {
  const out: FoundImage[] = [];
  let offset = 0;
  let inFence = false;
  for (const line of source.split("\n")) {
    if (/^```/.test(line)) inFence = !inFence;
    else if (!inFence) {
      const m = line.match(IMAGE_LINE);
      if (m) out.push({ index: out.length, start: offset, end: offset + line.length, alt: m[1], url: m[2], attrs: parseImageAttrs(m[3]) });
    }
    offset += line.length + 1;
  }
  return out;
}

/** Rewrites one image's size/alignment in the text. Returns the text unchanged if there's no such image. */
export function setImageAttrs(source: string, index: number, attrs: ImageAttrs): string {
  const img = findImages(source)[index];
  if (!img) return source;
  return source.slice(0, img.start) + imageLine(img.alt, img.url, attrs) + source.slice(img.end);
}

// ---- the stand-in shown while a picture is still uploading
export const UPLOADING_PREFIX = "uploading-";
export const uploadingLine = (id: number) => `![Uploading image…](${UPLOADING_PREFIX}${id})`;
export const isUploadingUrl = (url: string) => url.startsWith(UPLOADING_PREFIX);

/** Replaces (or, with null, removes) one exact line of the text. Used to settle an upload's stand-in line. */
export function replaceLine(source: string, exact: string, replacement: string | null): string {
  const lines = source.split("\n");
  const at = lines.findIndex((l) => l === exact);
  if (at === -1) return source;
  if (replacement !== null) lines[at] = replacement;
  else {
    lines.splice(at, 1);
    if (lines[at - 1] === "" && lines[at] === "") lines.splice(at, 1); // don't leave a double gap where it was
  }
  return lines.join("\n");
}

/** Swaps an upload's stand-in line for the finished image line (or removes it if the upload failed). */
export const replaceUploading = (source: string, id: number, replacement: string | null) => replaceLine(source, uploadingLine(id), replacement);

/** The stand-in for a file that is still uploading; it becomes `@file(address)` when done. */
export const uploadingFileLine = (id: number, name: string) => `@file(${UPLOADING_PREFIX}${id})[${name.replace(/[\[\]\n]/g, " ")}]`;
