import { api } from "./api";
import { kSubEnergies, loudnessFromSub } from "./soundReport";

// The site plays everything at -11 LUFS (integrated loudness, BS.1770): a loud, modern reference. Tracks louder than that are turned down to it.
// A track quieter than that is turned up only as far as its own peak allows, so normalizing never makes anything clip.
export const TARGET_LUFS = -11;
const PEAK_MARGIN_DB = 0.3; // headroom left under full scale: a little for inter-sample peaks
const MAX_GAIN_DB = 24;

/** The gain to apply, in dB: toward -11 LUFS, but never more than the peak headroom when boosting. */
export function gainForLoudness(lufs: number, peakDb: number): number {
  let gain = TARGET_LUFS - lufs;
  if (gain > 0) gain = Math.min(gain, Math.max(0, -peakDb - PEAK_MARGIN_DB));
  return Math.max(-MAX_GAIN_DB, Math.min(MAX_GAIN_DB, gain));
}

// Guards against kicking off two analyses of the same track in one
// session (e.g. rapid track-skipping back and forth) - this is purely a
// same-tab in-flight guard, not a durable cache; the real cache is the
// server-side replayGainDb field once this submits successfully.
const inFlight = new Set<string>();

/** Decodes the full track and measures its loudness and peak, converted to a
 *  gain adjustment in dB toward TARGET_LUFS. Never throws outward -
 *  any failure (network, decode, unsupported format) just means this
 *  track stays unanalyzed and plays at its original volume. */
async function computeGainDb(fileUrl: string): Promise<number | null> {
  try {
    const res = await fetch(fileUrl);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    // A throwaway context purely for decodeAudioData - nothing here ever
    // connects to speakers, so it can't affect actual playback.
    const decodeCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
    } finally {
      void decodeCtx.close().catch(() => {});
    }

    // loudness: every channel's K-weighted energy is summed (as the standard says); peak: the highest sample in any channel
    let sub: number[] | null = null;
    let peak = 0;
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const data = audioBuffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) { const a = data[i] < 0 ? -data[i] : data[i]; if (a > peak) peak = a; }
      const e = kSubEnergies(data, audioBuffer.sampleRate);
      if (!sub) sub = e;
      else for (let i = 0; i < e.length; i++) sub[i] += e[i];
    }
    const { integrated } = loudnessFromSub(sub ?? []);
    if (integrated === null) return null; // silence: nothing to normalize
    return gainForLoudness(integrated, 20 * Math.log10(Math.max(peak, 1e-6)));
  } catch (err) {
    console.error("ReplayGain analysis failed (track plays at original volume):", err);
    return null;
  }
}

/** Kicks off background analysis for a track that has no cached gain yet
 *  - fire-and-forget, never awaited by playback. If this tab computes a
 *  value, it's submitted to be cached for every future listener. */
export function analyzeAndSubmitReplayGain(track: { id: number; fileUrl: string; source?: "official" | "community" }): void {
  const key = `${track.source ?? "official"}:${track.id}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);

  computeGainDb(track.fileUrl)
    .then((gainDb) => {
      if (gainDb === null) return;
      const endpoint = track.source === "community" ? `/api/community-tracks/${track.id}/replay-gain` : `/api/tracks/${track.id}/replay-gain`;
      return api(endpoint, { method: "POST", body: JSON.stringify({ gainDb }) }).catch(() => {});
    })
    .finally(() => inFlight.delete(key));
}
