import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { takePendingAnalysis, type AnalyzeSource } from "../lib/analyzerHandoff";
import { useAuth } from "../lib/auth";
import { decodeForAnalysis } from "../lib/decodeForAnalysis";
import { describe, fmtTime, reportToMarkdown, type SoundReport } from "../lib/soundReport";
import type { ReportMessage } from "../workers/soundReport.worker";

type Phase = { name: "idle" } | { name: "reading"; file: string } | { name: "measuring"; file: string; stage: string } | { name: "done"; report: SoundReport } | { name: "error"; message: string };

const cssVar = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

function drawWave(c: HTMLCanvasElement, r: SoundReport) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = c.clientWidth, h = c.clientHeight;
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const g = c.getContext("2d")!;
  g.scale(dpr, dpr);
  g.clearRect(0, 0, w, h);
  const accent = cssVar("--accent-audio", "#7aa2ff");
  const dim = cssVar("--text-dim", "#888");
  const n = r.peaks.length / 2;
  g.fillStyle = accent; g.globalAlpha = 0.55;
  for (let i = 0; i < n; i++) {
    const x = (i / n) * w;
    const lo = r.peaks[i * 2], hi = r.peaks[i * 2 + 1];
    const y0 = h / 2 - hi * (h / 2), y1 = h / 2 - lo * (h / 2);
    g.fillRect(x, y0, Math.max(1, w / n), Math.max(1, y1 - y0));
  }
  g.globalAlpha = 1;
  // loudness curve over the waveform
  const vals = r.loudSeries.filter((p) => p.v != null) as { t: number; v: number }[];
  if (vals.length > 1) {
    g.strokeStyle = cssVar("--text", "#fff"); g.lineWidth = 1.5; g.beginPath();
    vals.forEach((p, i) => { const x = (p.t / r.duration) * w; const y = h - ((Math.max(-60, Math.min(0, p.v)) + 60) / 60) * h; i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
    g.fillStyle = dim; g.font = "11px sans-serif"; g.fillText("line: loudness (LUFS)", 6, 13);
  }
}

function drawBands(c: HTMLCanvasElement, r: SoundReport) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = c.clientWidth, h = c.clientHeight;
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const g = c.getContext("2d")!;
  g.scale(dpr, dpr);
  g.clearRect(0, 0, w, h);
  const n = r.bands.length, bw = w / n, labelH = 14;
  g.fillStyle = cssVar("--accent-audio", "#7aa2ff");
  r.bands.forEach((b, i) => { const bh = ((Math.max(-60, b.db) + 60) / 60) * (h - labelH); g.fillRect(i * bw + 1, h - labelH - bh, bw - 2, bh); });
  g.fillStyle = cssVar("--text-dim", "#888"); g.font = "10px sans-serif"; g.textAlign = "center";
  r.bands.forEach((b, i) => { if ([31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].some((f) => Math.abs(b.hz - f) / f < 0.13)) g.fillText(b.hz >= 1000 ? `${Math.round(b.hz / 1000)}k` : String(b.hz), i * bw + bw / 2, h - 2); });
}

function drawSpectrogram(c: HTMLCanvasElement, r: SoundReport) {
  const { rgba, width, height } = r.spectrogram;
  c.width = width; c.height = height;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
}

const f1 = (x: number) => x.toFixed(1).replace("-", "−");

export function SoundAnalyzer() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const bandsRef = useRef<HTMLCanvasElement>(null);
  const specRef = useRef<HTMLCanvasElement>(null);

  const run = useCallback(async (src: AnalyzeSource) => {
    workerRef.current?.terminate();
    setPhase({ name: "reading", file: src.name });
    try {
      const d = await decodeForAnalysis(src.blob);
      if (d.samples.length < 2048) throw new Error("That sound is too short to measure (under 0.05 s).");
      const worker = new Worker(new URL("../workers/soundReport.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      worker.onmessage = (e: MessageEvent<ReportMessage>) => {
        const m = e.data;
        if (m.type === "stage") setPhase({ name: "measuring", file: src.name, stage: m.name });
        else if (m.type === "done") { setPhase({ name: "done", report: m.report }); worker.terminate(); }
        else { setPhase({ name: "error", message: m.message }); worker.terminate(); }
      };
      worker.onerror = () => { setPhase({ name: "error", message: "The analysis stopped unexpectedly." }); worker.terminate(); };
      setPhase({ name: "measuring", file: src.name, stage: "Starting" });
      worker.postMessage({ samples: d.samples, sampleRate: d.sampleRate, fileName: src.name, stereo: d.stereo, truncated: d.truncated, reducedRate: d.reducedRate }, [d.samples.buffer]);
    } catch (err) {
      setPhase({ name: "error", message: err instanceof Error ? err.message : "Could not read that file." });
    }
  }, []);

  useEffect(() => {
    const pending = takePendingAnalysis();
    if (pending) run(pending);
    return () => workerRef.current?.terminate();
  }, [run]);

  const report = phase.name === "done" ? phase.report : null;
  useEffect(() => {
    if (!report) return;
    const redraw = () => { if (waveRef.current) drawWave(waveRef.current, report); if (bandsRef.current) drawBands(bandsRef.current, report); };
    redraw();
    if (specRef.current) drawSpectrogram(specRef.current, report);
    window.addEventListener("resize", redraw);
    return () => window.removeEventListener("resize", redraw);
  }, [report]);

  function pick(files: FileList | null | undefined) {
    const f = files?.[0];
    if (f) run({ blob: f, name: f.name });
  }

  async function copyNotes() {
    if (!report) return;
    try { await navigator.clipboard.writeText(reportToMarkdown(report)); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  }
  function download(name: string, blob: Blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function startStudy() {
    if (!report) return;
    const created = await api<{ slug: string }>("/api/studies", { method: "POST", body: JSON.stringify({ title: `Analysis: ${report.fileName.replace(/\.[^.]+$/, "")}`, body: reportToMarkdown(report) }) });
    navigate(`/study/${created.slug}`);
  }

  const busy = phase.name === "reading" || phase.name === "measuring";
  const findings = report ? describe(report) : [];

  return (
    <div className="an" data-testid="analyzer">
      <div
        className={`an-drop${dragging ? " an-drop-over" : ""}${busy ? " an-drop-busy" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files); }}
      >
        <input ref={inputRef} className="sr-only" type="file" accept="audio/*,video/*,.flac,.opus,.m4a" aria-label="Choose a sound file to analyze" data-testid="analyzer-input" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
        {phase.name === "idle" && (<>
          <p className="home-dim">LUFS, dB peak, spectrum, tempo, pitch analyzed in your browser locally.</p>
          <button className="btn btn-primary" onClick={() => inputRef.current?.click()}>Choose or drop a file</button>
        </>)}
        {busy && (
          <div role="status" aria-live="polite" data-testid="analyzer-progress">
            <p className="an-drop-title">{phase.name === "reading" ? "Reading" : "Measuring"} {phase.file}</p>
            <p className="home-dim">{phase.name === "measuring" ? `${phase.stage}…` : "Decoding…"}</p>
          </div>
        )}
        {phase.name === "error" && (<>
          <p role="alert" className="an-err">{phase.message}</p>
          <button className="btn" onClick={() => inputRef.current?.click()}>Try another file</button>
        </>)}
        {report && (
          <div className="an-done">
            <b className="an-file">{report.fileName}</b>
            <span className="home-dim">{fmtTime(report.duration)} · {Math.round(report.sampleRate / 100) / 10} kHz</span>
            <button className="btn" onClick={() => inputRef.current?.click()}>Analyze another</button>
          </div>
        )}
      </div>

      {report && (<>
        <ul className="an-findings" data-testid="analyzer-findings">
          {findings.map((f, i) => <li key={i} className={`an-f an-f-${f.tone}`}>{f.text}</li>)}
        </ul>

        <dl className="an-stats">
          <div><dt>Loudness</dt><dd>{report.lufs != null ? `${f1(report.lufs)} LUFS` : "n/a"}</dd></div>
          <div><dt>Peak</dt><dd>{f1(report.peakDb)} dBFS</dd></div>
          <div><dt>Range</dt><dd>{report.loudnessRange != null ? `${f1(report.loudnessRange)} LU` : "n/a"}</dd></div>
          <div><dt>Pitch</dt><dd>{report.pitch ? report.pitch.note : "none"}</dd></div>
          <div><dt>Tempo</dt><dd>{report.tempo ? `${Math.round(report.tempo.bpm)} BPM` : "no pulse"}</dd></div>
          <div><dt>Key</dt><dd>{report.key ? report.key.name : "unclear"}</dd></div>
          <div><dt>Brightness</dt><dd>{report.centroidHz != null ? `${Math.round(report.centroidHz)} Hz` : "n/a"}</dd></div>
          <div><dt>Crest</dt><dd>{f1(report.crestDb)} dB</dd></div>
        </dl>

        <figure className="an-fig"><figcaption>Waveform and loudness</figcaption><canvas ref={waveRef} className="an-canvas an-wave" role="img" aria-label="Waveform with the loudness curve over it" /></figure>
        <figure className="an-fig"><figcaption>Where the energy sits (one-third octaves)</figcaption><canvas ref={bandsRef} className="an-canvas an-bands" role="img" aria-label="Average spectrum in one-third octave bands" /></figure>
        <figure className="an-fig"><figcaption>Spectrogram (0 to {Math.round(report.spectrogram.maxHz / 100) / 10} kHz)</figcaption><canvas ref={specRef} className="an-canvas an-spec" role="img" aria-label="Spectrogram" /></figure>

        <div className="an-actions">
          <button className="btn" onClick={copyNotes}>{copied ? "Copied" : "Copy as notes"}</button>
          <button className="btn" onClick={() => download(`${report.fileName.replace(/\.[^.]+$/, "")}-analysis.json`, new Blob([JSON.stringify({ ...report, peaks: undefined, spectrogram: undefined, loudSeries: undefined, bands: report.bands }, null, 2)], { type: "application/json" }))}>Download numbers</button>
          <button className="btn" onClick={() => specRef.current?.toBlob((b) => b && download(`${report.fileName.replace(/\.[^.]+$/, "")}-spectrogram.png`, b))}>Save spectrogram</button>
          {user && <button className="btn btn-primary" onClick={startStudy} data-testid="analyzer-study">Start a study from this</button>}
        </div>
      </>)}
    </div>
  );
}
