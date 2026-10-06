import { Chain, type ChainPreset } from "./voiceChain";
import type { AirwindowsEngine } from "./airwindows";
import { StreamLimiter } from "./limiter";
import { LoudnessMeter } from "./loudnessMeter";
import { createSpool, type Spool, type SpoolFormat } from "./spool";
import { MAX_GAIN_DB, PEAK_CEILING_DB, TAIL_SECONDS, VOICE_NOTE_TARGET_LUFS, type VoiceNoteStats } from "./voiceNote";

// The voice note pipeline for recordings of any length. Same steps and the same result as renderVoiceNote (which holds a
// whole recording in memory), but audio is handled a piece at a time and parked on disk, so memory stays flat.

const DUAL_MONO_DB = 10 * Math.log10(2);
const BLOCK = 4096; // the most the effect chain takes at once

/** A recording to read, possibly more than once. */
export interface PcmInput {
  sampleRate: number;
  /** Used only to show progress; the amount actually read is what counts. */
  frames: number;
  read(): AsyncIterable<{ left: Float32Array; right: Float32Array | null }>;
}

/** Where the finished mono samples go (an encoder, or a test collecting them). */
export interface SampleSink {
  add(chunk: Float32Array): Promise<void> | void;
}

export interface StreamOptions {
  seed?: number;
  onProgress?: (p: number) => void;
  signal?: AbortSignal;
  /** Where to park intermediate audio. Defaults to disk where the browser allows it. */
  spool?: (format: SpoolFormat) => Promise<Spool>;
}

/** A recording that is already in memory (a test, or a short clip). */
export function bufferInput(left: Float32Array, right: Float32Array | null, sampleRate: number, chunk = 16384): PcmInput {
  return {
    sampleRate,
    frames: left.length,
    async *read() {
      for (let p = 0; p < left.length; p += chunk) yield { left: left.subarray(p, p + chunk), right: right ? right.subarray(p, p + chunk) : null };
    },
  };
}

/** A mono recording kept in a spool (what the recorder captures). */
export function spoolInput(spool: Spool, sampleRate: number): PcmInput {
  return {
    sampleRate,
    frames: spool.frames,
    async *read() {
      for await (const chunk of spool.read(16384)) yield { left: chunk, right: null };
    },
  };
}

class Cancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "AbortError";
  }
}

/**
 * Builds a voice note from audio that arrives piece by piece (a live recording, or a file read in chunks). push() runs each piece
 * through the effect straight away and parks the result on disk, so nothing else about the recording has to be kept; finish()
 * adds the reverb tail and does the measuring, levelling and encoding. Memory use does not depend on the length of the note.
 */
export class VoiceNoteBuilder {
  private chain: Chain | null;
  private raw: Spool | null;
  /** Where the audio was kept, remembered after the storage itself is released. */
  private readonly storage: string;
  private sum = 0;
  private n = 0;
  private readonly out = new Float32Array(65536);
  private fill = 0;
  private lastYield = performance.now();
  private finished = false;

  private constructor(private readonly sr: number, private readonly engine: AirwindowsEngine, private readonly preset: ChainPreset, private readonly opts: StreamOptions, raw: Spool) {
    this.chain = new Chain(engine, preset, sr, opts.seed ?? 1);
    this.raw = raw;
    this.storage = raw.kind;
  }

  static async create(engine: AirwindowsEngine, preset: ChainPreset, sampleRate: number, opts: StreamOptions = {}): Promise<VoiceNoteBuilder> {
    return new VoiceNoteBuilder(sampleRate, engine, preset, opts, await (opts.spool ?? createSpool)("f32"));
  }

  /** Seconds of recording received so far. */
  get seconds(): number {
    return this.n / this.sr;
  }

  private async flush() {
    if (this.fill > 0) await this.raw!.append(this.out.subarray(0, this.fill));
    this.fill = 0;
  }

  private async run(l: Float32Array, r: Float32Array) {
    this.chain!.processBlock(l, r);
    for (let i = 0; i < l.length; i++) {
      const v = Math.fround(0.5 * (l[i] + r[i])); // mono: the average keeps the voice at the same level
      this.sum += v;
      this.out[this.fill++] = v;
      if (this.fill === this.out.length) await this.flush();
    }
  }

  /** Adds recorded audio. May throw if the device has no room left to keep it. */
  async push(left: Float32Array, right: Float32Array | null = null): Promise<void> {
    if (this.finished) throw new Error("already finished");
    for (let p = 0; p < left.length; p += BLOCK) {
      const l = Float32Array.from(left.subarray(p, p + BLOCK));
      await this.run(l, right ? Float32Array.from(right.subarray(p, p + BLOCK)) : Float32Array.from(l));
    }
    this.n += left.length;
    if (this.opts.signal?.aborted) throw new Cancelled();
  }

  /** Where the audio was kept: "opfs" (on disk) or "memory". Still answers after the recording is finished and its storage released. */
  get spoolKind(): string {
    return this.storage;
  }

  /** Ends the recording and produces the finished note. `onProgress` is 0 to 1 across this step. */
  async finish(sink: SampleSink, onProgress?: (p: number) => void): Promise<VoiceNoteStats> {
    const { sr, opts } = this;
    const raw = this.raw!;
    const tail = Math.round(TAIL_SECONDS * sr);
    const ceiling = Math.pow(10, PEAK_CEILING_DB / 20);
    let progress = 0;
    const report = (p: number) => {
      if (p > progress) {
        progress = Math.min(1, p);
        onProgress?.(progress);
      }
    };
    const checkpoint = async () => {
      if (opts.signal?.aborted) throw new Cancelled();
      if (performance.now() - this.lastYield > 40) {
        await new Promise((r) => setTimeout(r, 0)); // so a cancel request or a progress message can be handled during a long job
        this.lastYield = performance.now();
        if (opts.signal?.aborted) throw new Cancelled();
      }
    };
    this.finished = true;
    try {
      if (this.n === 0) throw new Error("There is nothing recorded.");
      // the recording is followed by silence, so the reverb has somewhere to ring out
      for (let done = 0; done < tail; done += BLOCK) {
        const len = Math.min(BLOCK, tail - done);
        await this.run(new Float32Array(len), new Float32Array(len));
        await checkpoint();
      }
      await this.flush();
      this.chain!.destroy();
      this.chain = null;
      const n = this.n;
      const total = n + tail;
      const mean = this.sum / total; // one plugin leaves a tiny constant DC offset; removed so the fade really ends in silence

      // the recording as it will sound before any gain: offset removed, then the fade over the tail
      const prepare = (chunk: Float32Array, start: number): Float32Array => {
        const o = new Float32Array(chunk.length);
        for (let i = 0; i < chunk.length; i++) {
          let v = Math.fround(chunk[i] - mean);
          const idx = start + i;
          if (idx >= n && tail > 1) v = Math.fround(v * (0.5 * (1 + Math.cos((Math.PI * (idx - n)) / (tail - 1)))));
          o[i] = v;
        }
        return o;
      };

      // ---- how loud is it? (the fade is part of what is measured: it changes the average, more for a short note) ----
      const meter = new LoudnessMeter(sr);
      let peak = 0;
      {
        let at = 0;
        for await (const chunk of raw.read()) {
          const p = prepare(chunk, at);
          at += chunk.length;
          for (let i = 0; i < p.length; i++) peak = Math.max(peak, Math.abs(p[i]));
          meter.push(p);
          await checkpoint();
        }
      }
      report(0.1);
      const measured = meter.integrated();
      const tooQuiet = measured === null;
      let gainDb = 0;
      let gainCapped = false;
      if (measured !== null) {
        gainDb = VOICE_NOTE_TARGET_LUFS - (measured + DUAL_MONO_DB);
        // The limiter turns the loudest moments down a little, which lowers the loudness slightly: find out by how much on a
        // trial run and add it back, so the finished note lands on the target and not just under it.
        if (peak * Math.pow(10, Math.min(gainDb, MAX_GAIN_DB) / 20) > ceiling) {
          for (let attempt = 0; attempt < 3; attempt++) {
            const gt = Math.pow(10, Math.min(MAX_GAIN_DB, gainDb) / 20);
            const lim = new StreamLimiter(sr, ceiling);
            const trial = new LoudnessMeter(sr);
            let at = 0;
            for await (const chunk of raw.read()) {
              const p = prepare(chunk, at);
              at += chunk.length;
              for (let i = 0; i < p.length; i++) p[i] = Math.fround(p[i] * gt);
              trial.push(lim.push(p));
              await checkpoint();
            }
            trial.push(lim.finish());
            const got = trial.integrated();
            report(0.1 + 0.08 * (attempt + 1));
            if (got === null || Math.abs(VOICE_NOTE_TARGET_LUFS - (got + DUAL_MONO_DB)) < 0.1) break;
            gainDb += VOICE_NOTE_TARGET_LUFS - (got + DUAL_MONO_DB);
          }
        }
        if (gainDb > MAX_GAIN_DB) {
          gainDb = MAX_GAIN_DB;
          gainCapped = true;
        }
        gainDb = Math.max(-MAX_GAIN_DB, gainDb);
      }

      // ---- the finished note ----
      const g = Math.pow(10, gainDb / 20);
      const limiter = new StreamLimiter(sr, ceiling);
      const finalMeter = new LoudnessMeter(sr);
      let outPeak = 0;
      const emit = async (chunk: Float32Array) => {
        if (chunk.length === 0) return;
        for (let i = 0; i < chunk.length; i++) outPeak = Math.max(outPeak, Math.abs(chunk[i]));
        finalMeter.push(chunk);
        await sink.add(chunk);
      };
      {
        let at = 0;
        for await (const chunk of raw.read()) {
          const p = prepare(chunk, at);
          at += chunk.length;
          for (let i = 0; i < p.length; i++) p[i] = Math.fround(p[i] * g);
          await emit(limiter.push(p));
          report(0.35 + 0.65 * (at / total));
          await checkpoint();
        }
        await emit(limiter.finish());
      }
      report(1);
      const finalL = finalMeter.integrated();
      return {
        inputSeconds: n / sr,
        outputSeconds: total / sr,
        gainDb,
        loudnessLufs: finalL === null ? null : finalL + DUAL_MONO_DB,
        peakDb: outPeak > 0 ? 20 * Math.log10(outPeak) : -Infinity,
        limiterDb: limiter.maxReductionDb(),
        gainCapped,
        tooQuiet,
      };
    } finally {
      await this.dispose();
    }
  }

  /** Frees the effect and deletes the temporary file. Safe to call more than once. */
  async dispose(): Promise<void> {
    this.finished = true;
    if (this.chain) {
      this.chain.destroy();
      this.chain = null;
    }
    if (this.raw) {
      const raw = this.raw;
      this.raw = null;
      await raw.dispose();
    }
  }
}

/** Builds a voice note from a recording that can be read in pieces (a test, a file). */
export async function renderVoiceNoteStreaming(engine: AirwindowsEngine, preset: ChainPreset, input: PcmInput, sink: SampleSink, opts: StreamOptions = {}): Promise<VoiceNoteStats> {
  const builder = await VoiceNoteBuilder.create(engine, preset, input.sampleRate, opts);
  let progress = 0;
  const report = (p: number) => {
    if (p > progress) {
      progress = p;
      opts.onProgress?.(progress);
    }
  };
  try {
    let read = 0;
    for await (const { left, right } of input.read()) {
      await builder.push(left, right);
      read += left.length;
      report(0.45 * Math.min(1, read / Math.max(1, input.frames)));
    }
    return await builder.finish(sink, (p) => report(0.45 + 0.55 * p));
  } finally {
    await builder.dispose();
  }
}
