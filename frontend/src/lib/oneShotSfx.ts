let sharedCtx: AudioContext | null = null;
const bufferCache = new Map<string, AudioBuffer>();
const loadingCache = new Map<string, Promise<AudioBuffer>>();

function ensureContext(): AudioContext {
  if (!sharedCtx) sharedCtx = new AudioContext();
  return sharedCtx;
}

export function resumeSharedContextIfNeeded(): void {
  if (sharedCtx && sharedCtx.state === "suspended") {
    sharedCtx.resume().catch((err) => console.error("Failed to resume shared audio context:", err));
  }
}

async function loadBuffer(url: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(url);
  if (cached) return cached;
  const loading = loadingCache.get(url);
  if (loading) return loading;

  const ctx = ensureContext();
  const promise = fetch(url)
    .then((res) => res.arrayBuffer())
    .then((arrayBuffer) => ctx.decodeAudioData(arrayBuffer))
    .then((buffer) => {
      bufferCache.set(url, buffer);
      loadingCache.delete(url);
      return buffer;
    });
  loadingCache.set(url, promise);
  return promise;
}

/** Plays a sound effect once via the Web Audio API rather than a plain
 *  <audio> element / new Audio(). On mobile, <audio> playback is commonly
 *  treated as "media" by the OS audio-focus system, which ducks or pauses
 *  other apps' background audio (music, podcasts) — Web Audio API buffer
 *  playback empirically doesn't trigger that (this is the same mechanism
 *  the spacemap scan loop already uses, which was confirmed not to duck). */
export async function playOneShotSfx(url: string, volume: number): Promise<void> {
  try {
    const ctx = ensureContext();
    if (ctx.state === "suspended") await ctx.resume();
    const buffer = await loadBuffer(url);
    const gain = ctx.createGain();
    gain.gain.value = volume;
    gain.connect(ctx.destination);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start();
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
  } catch (err) {
    console.error("One-shot SFX playback failed:", err);
  }
}
