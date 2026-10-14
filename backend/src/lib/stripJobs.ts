// Drawing a track's spectrogram strip: one ffmpeg at a time, one job per track however many ask, and the result kept on disk for good.
// Shared by the track page's strip and the Spectral wall, so both use the same queue and the same cache files.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { UPLOADS_DIR } from "./storage.js";
import { normalizeStrip, packPoints, runFfmpeg, stripCacheName, stripSource, toPoints } from "./specStrip.js";

export type StripResult = Uint8Array | "missing" | null; // packed points, "no ffmpeg on this server", or "can't be drawn"
const inflight = new Map<number, Promise<StripResult>>();
let queue: Promise<unknown> = Promise.resolve(); // one drawing at a time: weak VPS friendly

const fileFor = (id: number, fileUrl: string) => path.join(UPLOADS_DIR, "spectro", stripCacheName(id, fileUrl));

/** The drawn strip if it already exists on disk; never starts any work. */
export async function readCachedStrip(trackId: number, fileUrl: string, offset: number): Promise<Buffer | null> {
  try { return await readFile(fileFor(trackId + offset, fileUrl)); } catch { return null; }
}

/** How many drawings are waiting or running right now. */
export const drawingCount = (): number => inflight.size;

/** Draw (or join the drawing of) this track's strip and keep it. */
export function drawStrip(trackId: number, fileUrl: string, offset: number): Promise<StripResult> {
  const key = trackId + offset;
  const running = inflight.get(key);
  if (running) return running;
  const job = (async (): Promise<StripResult> => {
    const src = stripSource(fileUrl, UPLOADS_DIR);
    if (!src) return null;
    const raw = (await (queue = queue.then(() => runFfmpeg(src)))) as Awaited<ReturnType<typeof runFfmpeg>>;
    if (raw === "missing") return "missing";
    const norm = raw ? normalizeStrip(raw) : null;
    const pts = norm ? toPoints(norm) : null;
    if (!pts) return null;
    const packed = packPoints(pts);
    await mkdir(path.join(UPLOADS_DIR, "spectro"), { recursive: true });
    await writeFile(fileFor(key, fileUrl), packed);
    return packed;
  })();
  inflight.set(key, job);
  void job.finally(() => inflight.delete(key));
  return job;
}
