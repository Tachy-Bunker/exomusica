import { useEffect, useRef, useState } from "react";
import { CHAIN_PRESETS } from "../lib/dsp/voiceChain";
import { EXPORT_FORMATS, type ExportFormat } from "../lib/dsp/encode";
import { useToastStore } from "../lib/toastStore";
import { VoiceNoteRecorder } from "../components/VoiceNoteRecorder";

type Which = "original" | "processed";

const FORMATS = Object.keys(EXPORT_FORMATS) as ExportFormat[];

const peakDb = (b: AudioBuffer) => {
  let m = 0;
  for (let c = 0; c < b.numberOfChannels; c++) for (const v of b.getChannelData(c)) m = Math.max(m, Math.abs(v));
  return m > 0 ? 20 * Math.log10(m) : -Infinity;
};
const fmtDb = (d: number) => (Number.isFinite(d) ? `${d.toFixed(1)} dBFS` : "silent");
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const AUDIO_EXT = /\.(wav|mp3|m4a|aac|ogg|oga|opus|flac|webm|mp4|aif|aiff|caf)$/i;
const looksLikeAudio = (f: File) => f.type.startsWith("audio/") || AUDIO_EXT.test(f.name);

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
  const [dragging, setDragging] = useState(false);
  const [converting, setConverting] = useState<{ format: ExportFormat; progress: number } | null>(null);
  const [tryNote, setTryNote] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const encoderRef = useRef<Worker | null>(null);
  const jobRef = useRef(0);
  const srcNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0); // context time at which position 0 would have started
  const recRef = useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: Blob[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

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

  // A file dropped slightly off target would otherwise make the browser leave the page and open it.
  useEffect(() => {
    const stop = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);

  useEffect(
    () => () => {
      stopPlayback();
      workerRef.current?.terminate();
      encoderRef.current?.terminate();
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

  function loadFiles(files: FileList | File[] | null | undefined) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    const f = list.find(looksLikeAudio) ?? list[0]; // if several were dropped, use the first one that is audio
    void loadBlob(f, f.name);
  }

  async function toggleRecording() {
    if (recording) {
      recRef.current?.recorder.stop();
      return;
    }
    setError(null);
    try {
      // the browser's own voice processing is switched off: the effect should get the raw voice
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

  /** Converts the processed audio to the chosen format (in a background worker) and saves it. */
  function exportAs(format: ExportFormat) {
    if (!processed || converting) return;
    const worker = (encoderRef.current ??= new Worker(new URL("../workers/encode.worker.ts", import.meta.url), { type: "module" }));
    const id = ++jobRef.current;
    setConverting({ format, progress: 0 });
    worker.onmessage = (e: MessageEvent<{ id: number; progress?: number; blob?: Blob; error?: string }>) => {
      if (e.data.id !== id) return;
      if (e.data.progress !== undefined) {
        setConverting({ format, progress: e.data.progress });
        return;
      }
      setConverting(null);
      if (e.data.error || !e.data.blob) {
        setError(`Couldn't convert to ${format}: ${e.data.error ?? "unknown error"}`);
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(e.data.blob);
      a.download = `${(source?.name ?? "voice").replace(/\.[^.]+$/, "").toLowerCase()}-enhanced.${EXPORT_FORMATS[format].ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      useToastStore.getState().showToast(`Saved as ${format}`);
    };
    // copies, so the processed audio stays available for the next format
    worker.postMessage({ id, format, sampleRate: processed.sampleRate, left: processed.getChannelData(0).slice(), right: processed.getChannelData(1).slice() });
  }

  const chain = CHAIN_PRESETS.find((p) => p.id === chainId)!;
  const total = (current ?? source?.buffer)?.duration ?? 0;
  const needsProcessing = !!source && !processed && progress === null;

  return (
    <div className="page-column" style={{ maxWidth: 720 }}>
      <h1>Voice lab</h1>
      <p style={{ color: "var(--text-dim)" }}>Record or load audio to process through our curated effects</p>

      <section style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", alignItems: "stretch", marginBottom: "1rem" }}>
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop an audio file here, or press to choose one"
          data-testid="voice-dropzone"
          className={`dropzone${dragging ? " dropzone-active" : ""}${source ? " dropzone-compact" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            dragDepth.current++;
            setDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={() => {
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            dragDepth.current = 0;
            setDragging(false);
            loadFiles(e.dataTransfer.files);
          }}
        >
          {dragging ? "Drop it here" : source ? "Drop another audio file, or click to choose" : "Drag an audio file here, or click to choose"}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            hidden
            data-testid="voice-file"
            onClick={(e) => e.stopPropagation()} // the input lives inside the zone: without this its click bubbles up and clicks it again
            onChange={(e) => {
              loadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        <button className={`btn${recording ? " btn-primary" : ""}`} onClick={() => void toggleRecording()} data-testid="voice-record" style={{ alignSelf: "center" }}>
          {recording ? "■ Stop recording" : "● Record"}
        </button>
      </section>

      {error && <p style={{ color: "var(--accent-forum)" }}>{error}</p>}

      {source && (
        <>
          <p data-testid="voice-duration">
            <b>{source.name}</b> · {fmtTime(source.buffer.duration)} · {source.buffer.numberOfChannels === 1 ? "mono" : "stereo"} · {source.buffer.sampleRate} Hz
          </p>
          <section style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center", marginBottom: "1rem" }}>
            <label>
              Effect{" "}
              <select value={chainId} onChange={(e) => setChainId(e.target.value)} disabled={progress !== null} data-testid="voice-chain">
                {CHAIN_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button className={`btn ${needsProcessing ? "btn-primary btn-attention" : ""}`} onClick={process} disabled={progress !== null} data-testid="voice-process">
              {progress !== null ? `Processing… ${Math.round(progress * 100)}%` : processed ? "Process again" : `Process with ${chain.name}`}
            </button>
          </section>

          <section style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.8rem" }}>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <button className={`btn${processed ? " btn-primary" : ""}`} onClick={togglePlay} data-testid="voice-play">
                {playing ? "❚❚ Pause" : "▶ Play"}
              </button>
              {processed && (
                <>
                  <button className={`btn${which === "original" ? " active" : ""}`} aria-pressed={which === "original"} onClick={() => switchTo("original")} data-testid="voice-ab-original">
                    Original
                  </button>
                  <button className={`btn${which === "processed" ? " active" : ""}`} aria-pressed={which === "processed"} onClick={() => switchTo("processed")} data-testid="voice-ab-processed">
                    Processed
                  </button>
                </>
              )}
              <span data-testid="voice-position" style={{ fontVariantNumeric: "tabular-nums" }}>
                {fmtTime(position)} / {fmtTime(total)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={total}
              step={0.05}
              value={Math.min(position, total)}
              style={{ width: "100%", marginTop: "0.6rem" }}
              aria-label="Position"
              onChange={(e) => {
                const t = Number(e.target.value);
                setPosition(t);
                if (playing && current) startPlayback(current, t);
              }}
            />
            <p data-testid="voice-peaks" style={{ color: "var(--text-dim)", fontSize: "0.85rem", margin: "0.4rem 0 0" }}>
              Loudest point: original {fmtDb(peakDb(source.buffer))}
              {processed && <> · processed {fmtDb(peakDb(processed))}</>}
            </p>
          </section>

          {processed && (
            <p data-testid="voice-formats" style={{ marginTop: "1rem", display: "flex", gap: "1.6rem", alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ color: "var(--text-dim)" }}>Download</span>
              {FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className="link-btn"
                  disabled={!!converting}
                  title={`${EXPORT_FORMATS[f].label} · ${EXPORT_FORMATS[f].detail}`}
                  aria-label={`Download as ${EXPORT_FORMATS[f].label}, ${EXPORT_FORMATS[f].detail}`}
                  data-testid={`voice-dl-${f}`}
                  onClick={() => exportAs(f)}
                >
                  {converting?.format === f ? `${f} ${Math.round(converting.progress * 100)}%` : f}
                </button>
              ))}
            </p>
          )}
        </>
      )}

      <h2 style={{ fontSize: "1.1rem", marginTop: "2rem" }}>Voice notes</h2>
      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>Hear exactly what a voice note will sound like: enhanced, levelled to the same loudness as the songs, mono, with a short fade-out.</p>
      {tryNote ? (
        <VoiceNoteRecorder
          doneLabel="Download .m4a"
          onCancel={() => setTryNote(false)}
          onDone={async ({ blob }) => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "voice-note.m4a";
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            setTryNote(false);
          }}
        />
      ) : (
        <button className="btn" onClick={() => setTryNote(true)} data-testid="lab-try-note">
          🎙 Try a voice note
        </button>
      )}
    </div>
  );
}
