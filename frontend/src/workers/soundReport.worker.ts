/// <reference lib="webworker" />
// Measures a sound off the main thread so the page stays responsive on weak devices. Receives the samples (transferred, not copied).
import { measureSound, type StereoInfo } from "../lib/soundReport";

export interface ReportJob { samples: Float32Array; sampleRate: number; fileName: string; stereo: StereoInfo | null; truncated: boolean; reducedRate: boolean }
export type ReportMessage = { type: "stage"; name: string } | { type: "done"; report: ReturnType<typeof measureSound> } | { type: "error"; message: string };

self.onmessage = (e: MessageEvent<ReportJob>) => {
  const j = e.data;
  try {
    const report = measureSound(j.samples, j.sampleRate, { fileName: j.fileName, stereo: j.stereo, truncated: j.truncated, reducedRate: j.reducedRate }, (name) => (self as DedicatedWorkerGlobalScope).postMessage({ type: "stage", name } satisfies ReportMessage));
    (self as DedicatedWorkerGlobalScope).postMessage({ type: "done", report } satisfies ReportMessage, [report.peaks.buffer, report.spectrogram.rgba.buffer]);
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({ type: "error", message: err instanceof Error ? err.message : "Could not analyze this file" } satisfies ReportMessage);
  }
};
