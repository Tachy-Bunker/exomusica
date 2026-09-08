import { api } from "./api";

// -18 dBFS RMS is a common, moderate reference level — loud enough that
// quiet tracks get a real boost, conservative enough that already-loud
// masters don't get pushed toward clipping-adjacent territory.
const TARGET_RMS_DB = -18;
const MAX_GAIN_DB = 24;

// Guards against kicking off two analyses of the same track in one
// session (e.g. rapid track-skipping back and forth) — this is purely a
// same-tab in-flight guard, not a durable cache; the real cache is the
// server-side replayGainDb field once this submits successfully.
const inFlight = new Set<string>();

/** Decodes the full track and computes its RMS loudness, converted to a
 *  gain adjustment in dB toward TARGET_RMS_DB. Never throws outward —
 *  any failure (network, decode, unsupported format) just means this
 *  track stays unanalyzed and plays at its original volume. */
async function computeGainDb(fileUrl: string): Promise<number | null> {
  try {
    const res = await fetch(fileUrl);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    // A throwaway context purely for decodeAudioData — nothing here ever
    // connects to speakers, so it can't affect actual playback.
    const decodeCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
    } finally {
      void decodeCtx.close().catch(() => {});
    }

    let sumSquares = 0;
    let sampleCount = 0;
    // Sampling every 8th frame keeps this fast on long tracks without
    // meaningfully changing the RMS estimate.
    const stride = 8;
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const data = audioBuffer.getChannelData(channel);
      for (let i = 0; i < data.length; i += stride) {
        sumSquares += data[i] * data[i];
        sampleCount++;
      }
    }
    if (sampleCount === 0) return null;
    const rms = Math.sqrt(sumSquares / sampleCount);
    const rmsDb = 20 * Math.log10(Math.max(rms, 1e-5)); // floor avoids -Infinity on silence
    const gainDb = TARGET_RMS_DB - rmsDb;
    return Math.max(-MAX_GAIN_DB, Math.min(MAX_GAIN_DB, gainDb));
  } catch (err) {
    console.error("ReplayGain analysis failed (track plays at original volume):", err);
    return null;
  }
}

/** Kicks off background analysis for a track that has no cached gain yet
 *  — fire-and-forget, never awaited by playback. If this tab computes a
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
