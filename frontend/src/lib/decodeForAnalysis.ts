// Decodes a user's audio file for the Analyzer: mono, capped in length, and at a lower rate for big files so weak devices cope.
import { MAX_ANALYSIS_SEC, type StereoInfo } from "./soundReport";

export interface Decoded { samples: Float32Array; sampleRate: number; stereo: StereoInfo | null; truncated: boolean; reducedRate: boolean }

export const BIG_FILE_BYTES = 12 * 1024 * 1024;

/** Mono mix plus how related the two channels are (computed in the same pass, so it costs nothing extra). */
export function mixDown(channels: Float32Array[], maxSamples: number): { mono: Float32Array; stereo: StereoInfo | null } {
  const n = Math.min(channels[0].length, maxSamples);
  const mono = new Float32Array(n);
  if (channels.length < 2) {
    mono.set(channels[0].subarray(0, n));
    return { mono, stereo: null };
  }
  const L = channels[0], R = channels[1];
  const extra = channels.length - 2;
  let ll = 0, rr = 0, lr = 0, mid = 0, side = 0;
  for (let i = 0; i < n; i++) {
    const l = L[i], r = R[i];
    ll += l * l; rr += r * r; lr += l * r;
    const m = (l + r) / 2, s = (l - r) / 2;
    mid += m * m; side += s * s;
    let sum = l + r;
    for (let c = 0; c < extra; c++) sum += channels[2 + c][i];
    mono[i] = sum / channels.length;
  }
  const correlation = ll > 0 && rr > 0 ? lr / Math.sqrt(ll * rr) : 1;
  const widthDb = 10 * Math.log10((side + 1e-20) / (mid + 1e-20));
  return { mono, stereo: { correlation, widthDb } };
}

export async function decodeForAnalysis(blob: Blob): Promise<Decoded> {
  const bytes = await blob.arrayBuffer();
  const reducedRate = bytes.byteLength > BIG_FILE_BYTES;
  const rate = reducedRate ? 22050 : 44100;
  const Offline = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const ctx = new Offline(1, 1, rate); // the context's rate is what the file is resampled to
  let buf: AudioBuffer;
  try {
    buf = await ctx.decodeAudioData(bytes);
  } catch {
    throw new Error("This browser could not read that file as audio. WAV, MP3, FLAC, OGG, M4A and Opus normally work.");
  }
  const channels = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const max = Math.floor(MAX_ANALYSIS_SEC * buf.sampleRate);
  const { mono, stereo } = mixDown(channels, max);
  return { samples: mono, sampleRate: buf.sampleRate, stereo, truncated: buf.length > max, reducedRate };
}
