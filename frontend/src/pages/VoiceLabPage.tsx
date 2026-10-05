import { useEffect, useRef, useState } from "react";
import { CHAIN_PRESETS } from "../lib/dsp/voiceChain";
import { encodeWav16 } from "../lib/dsp/wav";
import { useToastStore } from "../lib/toastStore";

type Which = "original" | "processed";

const peakDb = (b: AudioBuffer) => {
  let m = 0;
  for (let c = 0; c < b.numberOfChannels; c++) for (const v of b.getChannelData(c)) m = Math.max(m, Math.abs(v));
  return m > 0 ? 20 * Math.log10(m) : -Infinity;
};
const fmtDb = (d: number) => (Number.isFinite(d) ? `${d.toFixed(1)} dBFS` : "silent");
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

export function VoiceLabPage() {
  const [source, setSource] = useState<{ name: string; buffer: AudioBuffer } | null>(null);
  const [processed, setProcessed] = useState<AudioBuffer | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [chainId, setChainId] = useState(CHAIN_PRESETS[0].id);
  const [which, setWhich] = useState<Which>("processed");
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const jobRef = useRef(0);
  const srcNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0); // context time at which position 0 would have started
  const recRef = useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: Blob[] } | null>(null);

  const ctx = () => (ctxRef.current ??= new AudioContext());
  const buffers = { original: source?.buffer ?? null, processed };
  const current = buffers[which];

  function stopPlayback() {
    const node = srcNodeRef.current;
    if (node) {
      node.onended = null;
      try {
        node.stop();
      } catch {
        // already stopped
      }
      srcNodeRef.current = null;
    }
    setPlaying(false);
  }

  function startPlayback(buffer: AudioBuffer, from: number) {
    const c = ctx();
    void c.resume();
    stopPlayback();
    const node = c.createBufferSource();
    node.buffer = buffer;
    node.connect(c.destination);
    node.onended = () => {
      if (srcNodeRef.current === node) {
        srcNodeRef.current = null;
        setPlaying(false);
        setPosition(0);
      }
    };
    node.start(0, Math.min(from, Math.max(0, buffer.duration - 0.01)));
    startedAtRef.current = c.currentTime - from;
    srcNodeRef.current = node;
    setPlaying(true);
  }

  // keep the position readout moving while playing
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 90 && ctxRef.current) {
        last = t;
        setPosition(Math.max(0, ctxRef.current.currentTime - startedAtRef.current));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(
    () => () => {
      stopPlayback();
      workerRef.current?.terminate();
      recRef.current?.stream.getTracks().forEach((t) => t.stop());
      void ctxRef.current?.close();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function loadBlob(blob: Blob, name: string) {
    setError(null);
    stopPlayback();
    setProcessed(null);
    setPosition(0);
    try {
      const buffer = await ctx().decodeAudioData(await blob.arrayBuffer());
      setSource({ name, buffer });
    } catch {
      setError("That file couldn't be read as audio.");
    }
  }

  async function toggleRecording() {
    if (recording) {
      recRef.current?.recorder.stop();
      return;
    }
    setError(null);
    try {
      // the browser's own voice processing is switched off: the chain should get the raw voice
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        recRef.current = null;
        void loadBlob(new Blob(chunks, { type: recorder.mimeType }), "Recording");
      };
      recRef.current = { recorder, stream, chunks };
      recorder.start();
      setRecording(true);
    } catch {
      setError("The microphone couldn't be opened. Check that the browser has permission to use it.");
    }
  }

  function process() {
    if (!source) return;
    setError(null);
    stopPlayback();
    setProgress(0);
    const worker = (workerRef.current ??= new Worker(new URL("../workers/voiceChain.worker.ts", import.meta.url), { type: "module" }));
    const id = ++jobRef.current;
    const b = source.buffer;
    const left = b.getChannelData(0).slice();
    const right = b.numberOfChannels > 1 ? b.getChannelData(1).slice() : null;
    worker.onmessage = (e: MessageEvent<{ id: number; progress?: number; left?: Float32Array; right?: Float32Array; error?: string }>) => {
      if (e.data.id !== id) return;
      if (e.data.error) {
        setError(`Processing failed: ${e.data.error}`);
        setProgress(null);
      } else if (e.data.left && e.data.right) {
        const out = ctx().createBuffer(2, e.data.left.length, b.sampleRate);
        out.copyToChannel(e.data.left as Float32Array<ArrayBuffer>, 0);
        out.copyToChannel(e.data.right as Float32Array<ArrayBuffer>, 1);
        setProcessed(out);
        setWhich("processed");
        setProgress(null);
      } else if (e.data.progress !== undefined) setProgress(e.data.progress);
    };
    worker.postMessage({ id, presetId: chainId, sampleRate: b.sampleRate, left, right }, right ? [left.buffer, right.buffer] : [left.buffer]);
  }

  function switchTo(next: Which) {
    if (next === which) return;
    setWhich(next);
    const buf = buffers[next];
    if (playing && buf) startPlayback(buf, position); // keep playing from the same moment, so the two can be compared directly
  }

  function togglePlay() {
    if (!current) return;
    if (playing) {
      stopPlayback();
      return;
    }
    startPlayback(current, position >= current.duration - 0.05 ? 0 : position);
  }

  function download() {
    if (!processed) return;
    const wav = encodeWav16(processed.getChannelData(0), processed.getChannelData(1), processed.sampleRate);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    a.download = `${(source?.name ?? "voice").replace(/\.[^.]+$/, "")}-processed.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    useToastStore.getState().showToast("Saved as a 16-bit WAV");
  }

  const chain = CHAIN_PRESETS.find((p) => p.id === chainId)!;

  return (
    <div className="page-column" style={{ maxWidth: 720 }}>
      <h1>Voice lab</h1>
      <p style={{ color: "var(--text-dim)" }}>
        Experimental. Record your voice or load an audio file, run it through a chain of Airwindows plugins, and compare the result with the original while it plays. This is the original Airwindows code, running in your browser;
        nothing is uploaded.
      </p>

      <section style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center", marginBottom: "1rem" }}>
        <button className={`btn${recording ? " btn-primary" : ""}`} onClick={() => void toggleRecording()} data-testid="voice-record">
          {recording ? "■ Stop recording" : "● Record"}
        </button>
        <label className="btn" style={{ cursor: "pointer" }}>
          Choose an audio file…
          <input
            type="file"
            accept="audio/*"
            hidden
            data-testid="voice-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void loadBlob(f, f.name);
            }}
          />
        </label>
      </section>

      {error && <p style={{ color: "var(--accent-forum)" }}>{error}</p>}

      {source && (
        <>
          <p data-testid="voice-duration">
            <b>{source.name}</b> · {fmtTime(source.buffer.duration)} · {source.buffer.numberOfChannels === 1 ? "mono" : "stereo"} · {source.buffer.sampleRate} Hz
          </p>
          <section style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center", marginBottom: "1rem" }}>
            <label>
              Chain{" "}
              <select value={chainId} onChange={(e) => setChainId(e.target.value)} disabled={progress !== null}>
                {CHAIN_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-primary" onClick={process} disabled={progress !== null} data-testid="voice-process">
              {progress !== null ? `Processing… ${Math.round(progress * 100)}%` : processed ? "Process again" : "Process"}
            </button>
          </section>
          <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
            {chain.description}
            <br />
            {chain.plugins.map((p) => `${p.plugin} (${p.role})`).join(" → ")}
          </p>
        </>
      )}

      {source && (
        <section style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.8rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn btn-primary" onClick={togglePlay} data-testid="voice-play">
              {playing ? "❚❚ Pause" : "▶ Play"}
            </button>
            <button className={`btn${which === "original" ? " active" : ""}`} aria-pressed={which === "original"} onClick={() => switchTo("original")} data-testid="voice-ab-original">
              Original
            </button>
            <button className={`btn${which === "processed" ? " active" : ""}`} aria-pressed={which === "processed"} disabled={!processed} onClick={() => switchTo("processed")} data-testid="voice-ab-processed">
              Processed
            </button>
            <span data-testid="voice-position" style={{ fontVariantNumeric: "tabular-nums" }}>
              {fmtTime(position)} / {fmtTime((current ?? source.buffer).duration)}
            </span>
            <button className="btn" onClick={download} disabled={!processed} data-testid="voice-download" style={{ marginLeft: "auto" }}>
              Download WAV
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={(current ?? source.buffer).duration}
            step={0.05}
            value={Math.min(position, (current ?? source.buffer).duration)}
            style={{ width: "100%", marginTop: "0.6rem" }}
            aria-label="Position"
            onChange={(e) => {
              const t = Number(e.target.value);
              setPosition(t);
              if (playing && current) startPlayback(current, t);
            }}
          />
          <p data-testid="voice-peaks" style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginBottom: 0 }}>
            Loudest point: original {fmtDb(peakDb(source.buffer))}
            {processed && <> · processed {fmtDb(peakDb(processed))}</>}
          </p>
        </section>
      )}
    </div>
  );
}
