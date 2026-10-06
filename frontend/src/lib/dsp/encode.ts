import { encodeWav16 } from "./wav";

// Turns a finished (stereo) recording into a downloadable file. Everything runs in the browser; the codecs are
// loaded only when a format is first used, so a visitor who just wants WAV never downloads them.

export type ExportFormat = "wav" | "mp3" | "aac" | "ogg";

export const EXPORT_FORMATS: Record<ExportFormat, { label: string; ext: string; mime: string; detail: string }> = {
  wav: { label: "wav", ext: "wav", mime: "audio/wav", detail: "16-bit, lossless" },
  mp3: { label: "mp3", ext: "mp3", mime: "audio/mpeg", detail: "256 kbps" },
  aac: { label: "aac", ext: "m4a", mime: "audio/mp4", detail: "96 kbps" },
  ogg: { label: "ogg", ext: "ogg", mime: "audio/ogg", detail: "192 kbps average" },
};

export const MP3_KBPS = 256;
export const AAC_BPS = 96_000;
/**
 * Ogg Vorbis is variable-rate: a quality setting gives very different bitrates for dense music and for a sparse voice
 * with pauses. To really deliver 192 kbps, the quality is calibrated on a sample of the audio first.
 */
export const OGG_TARGET_KBPS = 192;

const MP3_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000];
const CHUNK = 48_000; // frames per step: keeps memory flat and lets progress be reported

const concat = (parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(parts.reduce((n, p) => n + p.length, 0)));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

async function wasmMedia(kind: "mp3" | "ogg", left: Float32Array, right: Float32Array | null, sampleRate: number, onProgress?: (p: number) => void, oggQuality = 6): Promise<Uint8Array<ArrayBuffer>> {
  const { createMp3Encoder, createOggEncoder } = await import("wasm-media-encoders");
  const enc = kind === "mp3" ? await createMp3Encoder() : await createOggEncoder();
  const channels = right ? 2 : 1;
  if (kind === "mp3") (enc as Awaited<ReturnType<typeof createMp3Encoder>>).configure({ sampleRate, channels, bitrate: MP3_KBPS as 256, ...(MP3_RATES.includes(sampleRate) ? {} : { outputSampleRate: 48000 }) });
  else (enc as Awaited<ReturnType<typeof createOggEncoder>>).configure({ sampleRate, channels, vbrQuality: oggQuality });
  const parts: Uint8Array[] = [];
  for (let pos = 0; pos < left.length; pos += CHUNK) {
    const end = Math.min(left.length, pos + CHUNK);
    parts.push(enc.encode(right ? [left.subarray(pos, end), right.subarray(pos, end)] : [left.subarray(pos, end)]).slice()); // the returned view is reused, so copy it
    onProgress?.(end / left.length);
  }
  parts.push(enc.finalize().slice());
  return concat(parts);
}

/** Up to 30 s of the recording (three 10 s pieces if it is longer), enough to see what bitrate this sound needs. */
function sample(left: Float32Array, right: Float32Array | null, sampleRate: number): { l: Float32Array; r: Float32Array | null } {
  const piece = 10 * sampleRate;
  if (left.length <= 3 * piece) return { l: left, r: right };
  const starts = [0, Math.floor((left.length - piece) / 2), left.length - piece];
  const cut = (a: Float32Array): Float32Array => {
    const out = new Float32Array(3 * piece);
    starts.forEach((st, i) => out.set(a.subarray(st, st + piece), i * piece));
    return out;
  };
  return { l: cut(left), r: right ? cut(right) : null };
}

/** Finds the Vorbis quality whose average bitrate for THIS audio is close to the target (a few quick trial encodes of a sample). */
async function oggQualityFor(left: Float32Array, right: Float32Array | null, sampleRate: number, targetKbps: number): Promise<number> {
  const { l, r } = sample(left, right, sampleRate);
  const seconds = l.length / sampleRate;
  let q = 6;
  let best = { q, err: Infinity };
  for (let pass = 0; pass < 4; pass++) {
    const kbps = ((await wasmMedia("ogg", l, r, sampleRate, undefined, q)).length * 8) / seconds / 1000;
    const err = Math.abs(Math.log(kbps / targetKbps));
    if (err < best.err) best = { q, err };
    if (err < 0.04) break; // within about 4%
    // each quality step changes the bitrate by roughly 17%
    q = Math.max(-1, Math.min(10, q + Math.log(targetKbps / kbps) / Math.log(1.17)));
    if (q === best.q) break; // at the end of the range already
  }
  return best.q;
}

/** Writes AAC audio into an .m4a file as it arrives, so a long recording never has to be in memory all at once. */
export class AacStreamEncoder {
  private frames = 0;
  private constructor(
    private readonly output: InstanceType<typeof import("mediabunny").Output>,
    private readonly source: InstanceType<typeof import("mediabunny").AudioSampleSource>,
    private readonly AudioSample: typeof import("mediabunny").AudioSample,
    private readonly sampleRate: number,
    private readonly channels: 1 | 2,
  ) {}

  static async create(sampleRate: number, channels: 1 | 2): Promise<AacStreamEncoder> {
    const { Output, Mp4OutputFormat, BufferTarget, AudioSampleSource, AudioSample, canEncodeAudio } = await import("mediabunny");
    // use the browser's own AAC encoder when it has one; otherwise a WebAssembly build of ffmpeg's AAC encoder
    if (!(await canEncodeAudio("aac", { numberOfChannels: channels, sampleRate, bitrate: AAC_BPS }))) {
      const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
      registerAacEncoder();
    }
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
    const source = new AudioSampleSource({ codec: "aac", bitrate: AAC_BPS });
    output.addAudioTrack(source);
    await output.start();
    return new AacStreamEncoder(output, source, AudioSample, sampleRate, channels);
  }

  async add(left: Float32Array, right: Float32Array | null = null): Promise<void> {
    const n = left.length;
    if (n === 0) return;
    const planar = new Float32Array(n * this.channels);
    planar.set(left, 0);
    if (this.channels === 2 && right) planar.set(right, n);
    const sample = new this.AudioSample({ data: planar, format: "f32-planar", numberOfChannels: this.channels, sampleRate: this.sampleRate, timestamp: this.frames / this.sampleRate });
    await this.source.add(sample);
    sample.close(); // release it promptly: a long recording would otherwise pile up
    this.frames += n;
  }

  async finish(): Promise<Uint8Array<ArrayBuffer>> {
    this.source.close();
    await this.output.finalize();
    return new Uint8Array((this.output.target as InstanceType<typeof import("mediabunny").BufferTarget>).buffer!);
  }
}

async function aacInMp4(left: Float32Array, right: Float32Array | null, sampleRate: number, onProgress?: (p: number) => void): Promise<Uint8Array<ArrayBuffer>> {
  const enc = await AacStreamEncoder.create(sampleRate, right ? 2 : 1);
  for (let pos = 0; pos < left.length; pos += CHUNK) {
    const end = Math.min(left.length, pos + CHUNK);
    await enc.add(left.subarray(pos, end), right ? right.subarray(pos, end) : null);
    onProgress?.(end / left.length);
  }
  return enc.finish();
}

/** Encodes audio in the chosen format: stereo, or mono when `right` is null. */
export async function encodeAudio(format: ExportFormat, left: Float32Array, right: Float32Array | null, sampleRate: number, onProgress?: (p: number) => void): Promise<Blob> {
  const mime = EXPORT_FORMATS[format].mime;
  if (format === "wav") return new Blob([encodeWav16(left, right, sampleRate)], { type: mime });
  const bytes =
    format === "aac"
      ? await aacInMp4(left, right, sampleRate, onProgress)
      : format === "ogg"
        ? await wasmMedia("ogg", left, right, sampleRate, onProgress, await oggQualityFor(left, right, sampleRate, OGG_TARGET_KBPS))
        : await wasmMedia("mp3", left, right, sampleRate, onProgress);
  return new Blob([bytes], { type: mime });
}
