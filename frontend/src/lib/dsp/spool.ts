// Somewhere to park audio while a long voice note is processed, so memory does not grow with its length. In a browser
// worker the audio goes to the origin-private file system (real files on disk); elsewhere it falls back to memory.

export type SpoolFormat = "f32" | "i16";

export interface Spool {
  readonly kind: "memory" | "opfs";
  /** Samples stored so far. */
  readonly frames: number;
  /** Adds samples (as floats; an "i16" spool rounds them to 16-bit). */
  append(data: Float32Array): Promise<void>;
  /** Reads everything back in order, in pieces of at most `chunk` samples, as floats. */
  read(chunk?: number): AsyncIterable<Float32Array>;
  /** Frees the storage. */
  dispose(): Promise<void>;
}

const toI16 = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v * 32768)));
export const DEFAULT_CHUNK = 65536;

export class MemorySpool implements Spool {
  readonly kind = "memory" as const;
  frames = 0;
  private parts: (Float32Array | Int16Array)[] = [];
  constructor(private readonly format: SpoolFormat) {}

  async append(data: Float32Array): Promise<void> {
    if (this.format === "f32") this.parts.push(data.slice());
    else {
      const q = new Int16Array(data.length);
      for (let i = 0; i < data.length; i++) q[i] = toI16(data[i]);
      this.parts.push(q);
    }
    this.frames += data.length;
  }

  async *read(chunk = DEFAULT_CHUNK): AsyncIterable<Float32Array> {
    for (const part of this.parts) {
      for (let p = 0; p < part.length; p += chunk) {
        const piece = part.subarray(p, Math.min(part.length, p + chunk));
        yield this.format === "f32" ? Float32Array.from(piece) : Float32Array.from(piece, (v) => v / 32768);
      }
    }
  }

  async dispose(): Promise<void> {
    this.parts = [];
    this.frames = 0;
  }
}

interface SyncHandle {
  write(buf: ArrayBufferView, opts?: { at?: number }): number;
  read(buf: ArrayBufferView, opts?: { at?: number }): number;
  flush(): void;
  close(): void;
}
interface Dir {
  getFileHandle(name: string, o?: { create?: boolean }): Promise<{ createSyncAccessHandle(): Promise<SyncHandle>; getFile(): Promise<{ lastModified: number }> }>;
  removeEntry(name: string): Promise<void>;
  entries(): AsyncIterable<[string, { kind: string }]>;
}

const PREFIX = "voicenote-";
const opfsDir = async (): Promise<Dir> => (await (navigator as unknown as { storage: { getDirectory(): Promise<Dir> } }).storage.getDirectory());

/** True where audio can be parked on disk: browser workers with the origin-private file system. */
export function opfsAvailable(): boolean {
  try {
    return typeof navigator !== "undefined" && typeof (navigator as { storage?: { getDirectory?: unknown } }).storage?.getDirectory === "function" && typeof FileSystemFileHandle !== "undefined" && "createSyncAccessHandle" in FileSystemFileHandle.prototype;
  } catch {
    return false;
  }
}

export class OpfsSpool implements Spool {
  readonly kind = "opfs" as const;
  frames = 0;
  private offset = 0;
  private readonly bytes: number;
  private constructor(private readonly format: SpoolFormat, private readonly dir: Dir, private readonly name: string, private readonly handle: SyncHandle) {
    this.bytes = format === "f32" ? 4 : 2;
  }

  static async create(format: SpoolFormat): Promise<OpfsSpool> {
    const dir = await opfsDir();
    const name = `${PREFIX}${crypto.randomUUID()}-${format}.bin`;
    const file = await dir.getFileHandle(name, { create: true });
    return new OpfsSpool(format, dir, name, await file.createSyncAccessHandle());
  }

  async append(data: Float32Array): Promise<void> {
    let view: ArrayBufferView;
    if (this.format === "f32") view = data;
    else {
      const q = new Int16Array(data.length);
      for (let i = 0; i < data.length; i++) q[i] = toI16(data[i]);
      view = q;
    }
    const wrote = this.handle.write(view, { at: this.offset });
    if (wrote !== view.byteLength) throw new Error("Not enough storage space to keep this recording while it is processed.");
    this.offset += view.byteLength;
    this.frames += data.length;
  }

  async *read(chunk = DEFAULT_CHUNK): AsyncIterable<Float32Array> {
    this.handle.flush();
    for (let at = 0; at < this.frames; at += chunk) {
      const n = Math.min(chunk, this.frames - at);
      if (this.format === "f32") {
        const out = new Float32Array(n);
        this.handle.read(out, { at: at * 4 });
        yield out;
      } else {
        const raw = new Int16Array(n);
        this.handle.read(raw, { at: at * 2 });
        yield Float32Array.from(raw, (v) => v / 32768);
      }
    }
  }

  async dispose(): Promise<void> {
    try {
      this.handle.close();
    } catch {
      // already closed
    }
    try {
      await this.dir.removeEntry(this.name);
    } catch {
      // already gone
    }
  }
}

/** Disk-backed when possible, memory otherwise. */
export async function createSpool(format: SpoolFormat): Promise<Spool> {
  if (opfsAvailable()) {
    try {
      return await OpfsSpool.create(format);
    } catch {
      // storage unavailable or locked: fall through to memory
    }
  }
  return new MemorySpool(format);
}

/** Removes spool files left behind by a crashed or closed tab (older than `maxAgeMs`). */
export async function removeStaleSpools(maxAgeMs = 60 * 60 * 1000): Promise<number> {
  if (!opfsAvailable()) return 0;
  let removed = 0;
  try {
    const dir = await opfsDir();
    const stale: string[] = [];
    for await (const [name, entry] of dir.entries()) {
      if (entry.kind !== "file" || !name.startsWith(PREFIX)) continue;
      try {
        const f = await (await dir.getFileHandle(name)).getFile();
        if (Date.now() - f.lastModified > maxAgeMs) stale.push(name);
      } catch {
        // can't inspect it (another tab may be using it): leave it
      }
    }
    for (const name of stale) {
      try {
        await dir.removeEntry(name);
        removed++;
      } catch {
        // locked by another tab: leave it
      }
    }
  } catch {
    // nothing to clean
  }
  return removed;
}
