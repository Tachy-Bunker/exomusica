import { loudness } from "../analysis";
import type { AirwindowsEngine } from "./airwindows";
import { limitPeaks } from "./limiter";
import { runChain, type ChainPreset } from "./voiceChain";

// A voice note: the recording is enhanced, given a reverb tail that fades out, mixed to mono, and levelled to the same
// loudness as the site's songs. All steps are plain functions on sample arrays, so each can be tested on its own.

/**
 * The loudness every voice note is levelled to, in LUFS as it is heard: a mono note played on stereo speakers is two
 * identical channels, which the standard (ITU-R BS.1770) counts as 3 dB louder than one channel alone.
 *
 * Why -14: the site levels songs to -18 dBFS RMS per channel (lib/replayGain.ts), which for music-like sound reads about
 * -15 LUFS as a stereo file (measured, see the calibration test). The owner chose -14, one unit above that, so a voice note
 * is not heard as quieter than a song. It is measured with the gated LUFS method, so pauses between words don't count
 * against it, which is what makes speech comparable to music.
 */
export const VOICE_NOTE_TARGET_LUFS = -14;
/** Extra time added after the recording, for the reverb to ring out; it fades to silence over exactly this long. */
export const TAIL_SECONDS = 2;
/** The loudest sample a voice note may have; a limiter catches anything above it. */
export const PEAK_CEILING_DB = -1;
/** The same cap on how much a quiet recording may be boosted as the site's songs have. */
export const MAX_GAIN_DB = 24;

const DUAL_MONO_DB = 10 * Math.log10(2);

export interface VoiceNoteStats {
  inputSeconds: number;
  outputSeconds: number;
  /** The gain that was applied for levelling (negative = turned down). */
  gainDb: number;
  /** Loudness of the finished note, as heard on stereo speakers. Null when it is silent. */
  loudnessLufs: number | null;
  peakDb: number;
  /** The most the peak limiter turned the sound down at any moment (0 when no peak needed catching). */
  limiterDb: number;
  /** The recording was so quiet that the boost hit its cap, so the note is quieter than the target. */
  gainCapped: boolean;
  /** Nothing measurable was recorded (a muted microphone, say), so nothing was boosted. */
  tooQuiet: boolean;
}

/** Integrated (gated) loudness of mono audio, in LUFS as heard on stereo speakers; null if it is too quiet to measure. */
export function dualMonoLufs(samples: Float32Array, sampleRate: number): number | null {
  const l = loudness(samples, sampleRate, 0, samples.length / sampleRate).integrated;
  return l === null ? null : l + DUAL_MONO_DB;
}

const peakOf = (a: Float32Array) => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]));
  return m;
};

/** Fades everything from `from` to the end smoothly to silence: gain 1 at `from`, 0.5 halfway, exactly 0 on the last sample. */
export function fadeTail(samples: Float32Array, from: number): void {
  const len = samples.length - from;
  if (len <= 1) return;
  for (let i = 0; i < len; i++) samples[from + i] *= 0.5 * (1 + Math.cos((Math.PI * i) / (len - 1)));
}

export interface RenderOptions {
  seed?: number;
  /** 0-1 across the effect; the caller can show it. */
  onProgress?: (p: number) => void;
}

/**
 * Renders a voice note from a recording. `left`/`right` are the recorded channels (right may be null for a mono
 * microphone). The result is a mono signal `TAIL_SECONDS` longer than the recording.
 */
export function renderVoiceNote(engine: AirwindowsEngine, preset: ChainPreset, left: Float32Array, right: Float32Array | null, sampleRate: number, opts: RenderOptions = {}): { samples: Float32Array; sampleRate: number; stats: VoiceNoteStats } {
  const n = left.length;
  if (n === 0) throw new Error("There is nothing recorded.");
  const tail = Math.round(TAIL_SECONDS * sampleRate);
  const total = n + tail;

  // the recording followed by silence, so the reverb has somewhere to ring out into
  const l = new Float32Array(total);
  const r = new Float32Array(total);
  l.set(left);
  r.set(right ?? left);
  runChain(engine, preset, sampleRate, l, r, { block: 4096, seed: opts.seed, inPlace: true, onProgress: opts.onProgress });

  // mono: the reverb widens the voice into stereo, so fold it back together (the average keeps the voice at the same level)
  for (let i = 0; i < total; i++) l[i] = 0.5 * (l[i] + r[i]);
  // one plugin leaves a tiny constant DC offset; remove it so the fade really ends in silence
  let mean = 0;
  for (let i = 0; i < total; i++) mean += l[i];
  mean /= total;
  for (let i = 0; i < total; i++) l[i] -= mean;

  // The fade is applied BEFORE measuring: the finished note is what must hit the target, and the fade changes the average a little
  // (more for a short note, where the tail is a bigger share). It doesn't depend on the gain, so the order is free.
  fadeTail(l, n);

  const measured = dualMonoLufs(l, sampleRate);
  const ceiling = Math.pow(10, PEAK_CEILING_DB / 20);
  let gainDb = 0;
  let gainCapped = false;
  const tooQuiet = measured === null;
  if (measured !== null) {
    gainDb = VOICE_NOTE_TARGET_LUFS - measured;
    // The limiter turns the loudest moments down a little, which lowers the loudness slightly. Find out by how much
    // on a trial copy and add it back, so the finished note lands on the target and not just under it.
    if (peakOf(l) * Math.pow(10, Math.min(gainDb, MAX_GAIN_DB) / 20) > ceiling) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const trial = l.slice();
        const gt = Math.pow(10, Math.min(MAX_GAIN_DB, gainDb) / 20);
        for (let i = 0; i < total; i++) trial[i] *= gt;
        limitPeaks(trial, sampleRate, ceiling);
        const got = dualMonoLufs(trial, sampleRate);
        if (got === null || Math.abs(VOICE_NOTE_TARGET_LUFS - got) < 0.1) break;
        gainDb += VOICE_NOTE_TARGET_LUFS - got;
      }
    }
    if (gainDb > MAX_GAIN_DB) {
      gainDb = MAX_GAIN_DB;
      gainCapped = true;
    }
    gainDb = Math.max(-MAX_GAIN_DB, gainDb);
  }
  const g = Math.pow(10, gainDb / 20);
  for (let i = 0; i < total; i++) l[i] *= g;
  const limiterDb = limitPeaks(l, sampleRate, ceiling);

  const peak = peakOf(l);
  return {
    samples: l,
    sampleRate,
    stats: { inputSeconds: n / sampleRate, outputSeconds: total / sampleRate, gainDb, loudnessLufs: dualMonoLufs(l, sampleRate), peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity, limiterDb, gainCapped, tooQuiet },
  };
}
