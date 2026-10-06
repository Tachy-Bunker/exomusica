/// <reference lib="webworker" />
// Converts a finished recording to wav / mp3 / aac / ogg off the main thread.
import { encodeAudio, type ExportFormat } from "../lib/dsp/encode";

interface Request {
  id: number;
  format: ExportFormat;
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, format, sampleRate, left, right } = e.data;
  try {
    const blob = await encodeAudio(format, left, right, sampleRate, (p) => self.postMessage({ id, progress: p }));
    self.postMessage({ id, blob });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
