// Checks what an upload actually contains against the type its name claims.
// The extension and the browser's MIME type both come from the uploader, so neither is trusted alone.
// Only extensions listed in RULES are checked; anything else passes through unchanged.

const at = (b: Uint8Array, off: number, bytes: number[]) => bytes.every((v, i) => b[off + i] === v);
const text = (b: Uint8Array, off: number, s: string) => [...s].every((c, i) => b[off + i] === c.charCodeAt(0));

const isPng = (b: Uint8Array) => at(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isJpeg = (b: Uint8Array) => at(b, 0, [0xff, 0xd8, 0xff]);
const isGif = (b: Uint8Array) => text(b, 0, "GIF87a") || text(b, 0, "GIF89a");
const isWebp = (b: Uint8Array) => text(b, 0, "RIFF") && text(b, 8, "WEBP");
const isBmp = (b: Uint8Array) => text(b, 0, "BM");
const isWav = (b: Uint8Array) => (text(b, 0, "RIFF") || text(b, 0, "RF64")) && text(b, 8, "WAVE");
const isOgg = (b: Uint8Array) => text(b, 0, "OggS");
const isFlac = (b: Uint8Array) => text(b, 0, "fLaC");
// MP3: an ID3 tag, or a frame sync whose layer bits are not 00 (layer 00 is AAC/ADTS, checked separately).
const isMp3 = (b: Uint8Array) => text(b, 0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0);
const isAdts = (b: Uint8Array) => b[0] === 0xff && (b[1] & 0xf6) === 0xf0;
// MP4 / M4A / MOV: an ftyp box, or the older QuickTime top-level atoms that appear where ftyp would be.
const isMp4 = (b: Uint8Array) => text(b, 4, "ftyp") || ["moov", "mdat", "wide", "free", "skip"].some((t) => text(b, 4, t));
const isWebm = (b: Uint8Array) => at(b, 0, [0x1a, 0x45, 0xdf, 0xa3]);
const isWoff = (b: Uint8Array) => text(b, 0, "wOFF");
const isWoff2 = (b: Uint8Array) => text(b, 0, "wOF2");
const isTtf = (b: Uint8Array) => at(b, 0, [0x00, 0x01, 0x00, 0x00]) || text(b, 0, "true");
const isOtf = (b: Uint8Array) => text(b, 0, "OTTO");
const isSvg = (b: Uint8Array) => {
  const head = Buffer.from(b.subarray(0, 4096)).toString("utf8").replace(/^﻿/, "").trimStart();
  return head.startsWith("<") && /<svg[\s>]/i.test(head);
};

const RULES: Record<string, (b: Uint8Array) => boolean> = {
  ".png": isPng,
  ".apng": isPng,
  ".jpg": isJpeg,
  ".jpeg": isJpeg,
  ".gif": isGif,
  ".webp": isWebp,
  ".bmp": isBmp,
  ".svg": isSvg,
  ".mp3": isMp3,
  ".wav": isWav,
  ".ogg": isOgg,
  ".oga": isOgg,
  ".opus": isOgg,
  ".flac": isFlac,
  ".aac": (b) => isAdts(b) || isMp4(b),
  ".m4a": isMp4,
  ".mp4": isMp4,
  ".mov": isMp4,
  ".m4v": isMp4,
  ".webm": isWebm,
  ".woff": isWoff,
  ".woff2": isWoff2,
  ".ttf": isTtf,
  ".otf": isOtf,
};

/** An error message when the bytes are not the type the extension claims; null when they match or the extension is not checked. */
export function signatureError(ext: string, bytes: Uint8Array): string | null {
  const rule = RULES[ext.toLowerCase()];
  if (!rule) return null;
  return rule(bytes) ? null : `the file is not really a ${ext.slice(1).toUpperCase()} file`;
}
