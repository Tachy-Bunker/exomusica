import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";

/** A track's spectrogram strip: STRIP_W columns (time) x STRIP_H rows (frequency, low at the bottom), one byte of brightness each. */
export const STRIP_W = 1000;
export const STRIP_H = 40;
export const STRIP_BYTES = STRIP_W * STRIP_H;
const TIMEOUT_MS = 120_000;

/** ffmpeg draws the picture itself (C speed, one thread); we only stretch the contrast afterwards. */
export function ffmpegArgs(src: string): string[] {
  return [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1",
    "-protocol_whitelist", "file,http,https,tcp,tls,crypto",
    "-i", src, "-vn",
    "-lavfi", `aformat=channel_layouts=mono,aresample=16000,showspectrumpic=s=${STRIP_W}x${STRIP_H}:legend=0:color=channel:scale=log:fscale=log:drange=75,format=gray`,
    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1",
  ];
}

/** Percentile contrast stretch so quiet and loud tracks both fill the gradient. Returns null if the data is not a full picture. */
export function normalizeStrip(raw: Uint8Array): Uint8Array | null {
  if (raw.length !== STRIP_BYTES) return null;
  const hist = new Uint32Array(256);
  for (let i = 0; i < raw.length; i++) hist[raw[i]]++;
  const at = (q: number): number => { let acc = 0; const goal = q * raw.length; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= goal) return v; } return 255; };
  const lo = at(0.2), hi = Math.max(lo + 8, at(0.995));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(((raw[i] - lo) / (hi - lo)) * 255)));
  return out;
}

/** Cache file name: changes when the track's audio address changes, so a replaced file is redrawn. */
export function stripCacheName(trackId: number, fileUrl: string): string {
  return `${trackId}-${createHash("sha1").update(fileUrl).digest("hex").slice(0, 10)}.spec`;
}

/** Where ffmpeg reads from: a file inside uploads (never outside it), or a web address. */
export function stripSource(fileUrl: string, uploadsDir: string): string | null {
  if (fileUrl.startsWith("/uploads/")) {
    const root = path.resolve(uploadsDir);
    const f = path.resolve(root, fileUrl.slice("/uploads/".length));
    return f.startsWith(root + path.sep) ? f : null;
  }
  return /^https?:\/\//i.test(fileUrl) ? fileUrl : null;
}

export function runFfmpeg(src: string): Promise<Uint8Array | "missing" | null> {
  return new Promise((resolve) => {
    let p;
    try { p = spawn("ffmpeg", ffmpegArgs(src), { stdio: ["ignore", "pipe", "ignore"] }); } catch { resolve("missing"); return; }
    const chunks: Buffer[] = []; let size = 0; let done = false;
    const finish = (v: Uint8Array | "missing" | null): void => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
    const timer = setTimeout(() => { p.kill("SIGKILL"); finish(null); }, TIMEOUT_MS);
    p.on("error", (e: NodeJS.ErrnoException) => finish(e.code === "ENOENT" ? "missing" : null));
    p.stdout.on("data", (c: Buffer) => { size += c.length; if (size > STRIP_BYTES * 2) { p.kill("SIGKILL"); finish(null); } else chunks.push(c); });
    p.on("close", () => finish(size === STRIP_BYTES ? new Uint8Array(Buffer.concat(chunks)) : null));
  });
}
