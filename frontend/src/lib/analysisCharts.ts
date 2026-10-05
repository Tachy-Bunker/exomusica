import { detectOnsets, loudness, spectralCentroid, yinPitch, type Measured } from "./analysis";
import { formatTime } from "./clips";

// Turns a measurement into a study chart. The settings used go into the title, so a figure always says how it was made.

export type AnalysisKind = "pitch" | "loudness" | "centroid" | "onsets";

export interface AnalysisChart {
  title: string;
  kind: "LINE" | "TABLE";
  xLabel: string | null;
  yLabel: string | null;
  dataCsv: string;
}

export const ANALYSIS_LABELS: Record<AnalysisKind, string> = {
  pitch: "Pitch contour (f0)",
  loudness: "Loudness (LUFS)",
  centroid: "Spectral centroid",
  onsets: "Onsets",
};

export const MAX_ANALYSIS_SECONDS = 120;

const num = (v: number, digits: number) => String(Number(v.toFixed(digits)));
const where = (start: number, end: number) => `${formatTime(start)}–${formatTime(end)}`;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

function seriesCsv(m: Measured, header: string, digits: number): { csv: string; present: number[] } {
  const rows = [`time_s,${header}`];
  const present: number[] = [];
  m.times.forEach((t, i) => {
    const v = m.values[i];
    rows.push(`${num(t, 3)},${v === null ? "" : num(v, digits)}`); // an empty cell is a gap in the line, not a zero
    if (v !== null) present.push(v);
  });
  return { csv: rows.join("\n"), present };
}

/** Returns the chart to add, or a plain-language reason there's nothing worth adding. */
export function buildAnalysisChart(
  kind: AnalysisKind,
  samples: Float32Array,
  sampleRate: number,
  startSec: number,
  endSec: number,
  opts: { fMin?: number; fMax?: number } = {},
): { chart: AnalysisChart } | { reason: string } {
  const span = where(startSec, endSec);
  if (endSec - startSec < 0.1) return { reason: "Select a passage at least a tenth of a second long." };
  if (endSec - startSec > MAX_ANALYSIS_SECONDS) return { reason: `Select a passage of up to ${MAX_ANALYSIS_SECONDS} seconds to analyze.` };

  if (kind === "pitch") {
    const fMin = opts.fMin ?? 70;
    const fMax = opts.fMax ?? 800;
    const p = yinPitch(samples, sampleRate, startSec, endSec, { fMin, fMax });
    const { csv, present } = seriesCsv(p, "f0_hz", 2);
    if (present.length < 3) return { reason: `No clear pitch between ${fMin} and ${fMax} Hz in this passage. Try a different range, or a passage with a sustained note.` };
    return { chart: { title: `Pitch contour ${span} · YIN, ${fMin}–${fMax} Hz, median ${num(median(present), 1)} Hz`, kind: "LINE", xLabel: "Time in recording (s)", yLabel: "f0 (Hz)", dataCsv: csv } };
  }
  if (kind === "loudness") {
    const l = loudness(samples, sampleRate, startSec, endSec);
    const { csv, present } = seriesCsv(l, "loudness_lufs", 2);
    if (present.length === 0) return { reason: "This passage is too quiet to measure." };
    const integrated = l.integrated === null ? "" : `, integrated ${num(l.integrated, 1)} LUFS`;
    return { chart: { title: `Loudness ${span} · ITU-R BS.1770, ${Math.round(l.windowSec * 1000)} ms window, mono${integrated}`, kind: "LINE", xLabel: "Time in recording (s)", yLabel: "Loudness (LUFS)", dataCsv: csv } };
  }
  if (kind === "centroid") {
    const c = spectralCentroid(samples, sampleRate, startSec, endSec);
    const { csv, present } = seriesCsv(c, "centroid_hz", 1);
    if (present.length === 0) return { reason: "This passage is too quiet to measure." };
    const mean = present.reduce((a, b) => a + b, 0) / present.length;
    return { chart: { title: `Spectral centroid ${span} · 2048-point FFT, mean ${num(mean, 0)} Hz`, kind: "LINE", xLabel: "Time in recording (s)", yLabel: "Centroid (Hz)", dataCsv: csv } };
  }
  const o = detectOnsets(samples, sampleRate, startSec, endSec);
  if (o.times.length === 0) return { reason: "No onsets found in this passage." };
  const rows = ["onset_s,strength", ...o.times.map((t, i) => `${num(t, 3)},${num(o.strength[i], 2)}`)];
  return { chart: { title: `Onsets ${span} · spectral flux, ${o.times.length} found`, kind: "TABLE", xLabel: null, yLabel: null, dataCsv: rows.join("\n") } };
}
