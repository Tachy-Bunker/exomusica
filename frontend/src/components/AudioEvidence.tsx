import { useEffect, useRef, useState } from "react";
import { canvasToPng, computePeaks, decodeToMono, renderSpectrogramCanvas, type DecodedAudio } from "../lib/audioAnalysis";
import { formatTime, type Clip } from "../lib/clips";
import { onClipPosition, playClip, stopClip, useClipPlayer } from "../lib/clipPlayer";
import { uploadAttachment } from "../lib/uploadAttachment";
import { useAudioStore } from "../lib/audioStore";
import { useToastStore } from "../lib/toastStore";
import { ClipButton } from "./ClipButton";

export interface EvidenceClip {
  n: number;
  clip: Clip;
  label: string;
}

interface Props {
  url: string;
  canCite: boolean;
  clips: EvidenceClip[];
  onCite?: (clip: Clip, label: string) => Promise<void>;
}

const WAVE_HEIGHT = 96;
const PEAK_BUCKETS = 1200;

export function AudioEvidence(props: Props) {
  return props.canCite ? <AudioTools {...props} /> : <ReaderAudio {...props} />;
}

function pauseMusicAndClips() {
  stopClip();
  const music = useAudioStore.getState();
  if (music.isPlaying) music.toggle();
}

function ClipList({ clips }: { clips: EvidenceClip[] }) {
  if (clips.length === 0) return null;
  return (
    <ul className="audio-clip-list">
      {clips.map((c) => (
        <li key={c.n}>
          <b>[{c.n}]</b> <ClipButton clip={c.clip} /> {c.label}
        </li>
      ))}
    </ul>
  );
}

/** Readers: a plain player (nothing downloads until they press play) and the cited clips. No audio is ever decoded on their device. */
function ReaderAudio({ url, clips }: Props) {
  return (
    <div className="audio-reader">
      <audio controls preload="none" src={url} data-evidence="" onPlay={pauseMusicAndClips} />
      <ClipList clips={clips} />
    </div>
  );
}

type LoadState = { status: "idle" | "loading" | "ready" } | { status: "error"; message: string };

function AudioTools({ url, clips, onCite }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const decodedRef = useRef<DecodedAudio | null>(null);
  const peaksRef = useRef<Float32Array | null>(null);
  const dragRef = useRef<{ x0: number; t0: number; moved: boolean } | null>(null);
  const [load, setLoad] = useState<LoadState>({ status: "idle" });
  const [duration, setDuration] = useState(0);
  const [width, setWidth] = useState(600);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [citing, setCiting] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [maxHz, setMaxHz] = useState<"auto" | number>("auto");
  const playing = useClipPlayer((s) => s.playing?.url === url);

  // Decode only once the block is near the screen - a page with several recordings shouldn't decode them all on load.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let cancelled = false;
    const run = () => {
      setLoad({ status: "loading" });
      decodeToMono(url)
        .then((audio) => {
          if (cancelled) return;
          decodedRef.current = audio;
          peaksRef.current = computePeaks(audio.samples, PEAK_BUCKETS);
          setDuration(audio.duration);
          setLoad({ status: "ready" });
        })
        .catch((err) => !cancelled && setLoad({ status: "error", message: err instanceof Error ? err.message : String(err) }));
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          run();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [url]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(200, el.clientWidth)));
    ro.observe(el);
    setWidth(Math.max(200, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  // playhead: written straight to the DOM, so playback doesn't re-render anything
  useEffect(
    () =>
      onClipPosition((u, t) => {
        const ph = playheadRef.current;
        if (!ph || u !== url) return;
        if (t < 0 || !duration) ph.style.display = "none";
        else {
          ph.style.display = "block";
          ph.style.left = `${(t / duration) * 100}%`;
        }
      }),
    [url, duration],
  );

  // waveform + cited regions + current selection
  useEffect(() => {
    const cv = canvasRef.current;
    const peaks = peaksRef.current;
    if (load.status !== "ready" || !cv || !peaks || !duration) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(WAVE_HEIGHT * dpr);
    const g = cv.getContext("2d")!;
    g.scale(dpr, dpr);
    g.fillStyle = "#07070f";
    g.fillRect(0, 0, width, WAVE_HEIGHT);
    const region = (start: number, end: number, fill: string) => {
      g.fillStyle = fill;
      g.fillRect((start / duration) * width, 0, Math.max(1.5, ((end - start) / duration) * width), WAVE_HEIGHT);
    };
    for (const c of clips) region(c.clip.start, c.clip.end, "rgba(79, 212, 196, 0.2)");
    if (selection) region(selection.start, selection.end, "rgba(143, 184, 255, 0.35)");
    let max = 0;
    for (let i = 0; i < peaks.length; i++) max = Math.max(max, Math.abs(peaks[i]));
    const scale = max > 0 ? (WAVE_HEIGHT / 2 - 3) / max : 1; // normalised, so quiet recordings are still readable
    g.fillStyle = "#e2703f";
    const mid = WAVE_HEIGHT / 2;
    for (let x = 0; x < width; x++) {
      const b = Math.min(PEAK_BUCKETS - 1, Math.floor((x / width) * PEAK_BUCKETS));
      const lo = peaks[b * 2] * scale;
      const hi = peaks[b * 2 + 1] * scale;
      g.fillRect(x, mid - hi, 1, Math.max(1, hi - lo));
    }
    g.font = "10px sans-serif";
    g.fillStyle = "#4fd4c4";
    for (const c of clips) g.fillText(`[${c.n}]`, (c.clip.start / duration) * width + 3, 11);
  }, [load.status, width, duration, selection, clips]);

  const timeAt = (clientX: number) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * duration;
  };

  function togglePlay() {
    if (playing) return stopClip();
    if (selection) playClip({ url, start: selection.start, end: selection.end });
    else playClip({ url, start: 0, end: duration });
  }

  async function cite() {
    const decoded = decodedRef.current;
    if (!decoded || !selection || !onCite) return;
    setBusy(true);
    let img: string | null = null;
    try {
      const png = await canvasToPng(renderSpectrogramCanvas(decoded, selection.start, selection.end, maxHz));
      img = await uploadAttachment(png, `spectrogram-${selection.start.toFixed(2)}-${selection.end.toFixed(2)}.png`);
    } catch {
      useToastStore.getState().showToast("Couldn't upload the spectrogram - adding the clip without one");
    }
    try {
      await onCite({ start: selection.start, end: selection.end, url, img }, label.trim() || "Audio clip");
      setCiting(false);
      setLabel("");
      setSelection(null);
    } finally {
      setBusy(false);
    }
  }

  const ready = load.status === "ready";
  const selLen = selection ? selection.end - selection.start : 0;

  return (
    <div className="audio-tools">
      <div
        ref={wrapRef}
        className="audio-wave"
        style={{ height: WAVE_HEIGHT, touchAction: "pan-y" }}
        onPointerDown={(e) => {
          if (!ready) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          dragRef.current = { x0: e.clientX, t0: timeAt(e.clientX), moved: false };
        }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (!d) return;
          if (Math.abs(e.clientX - d.x0) > 4) d.moved = true;
          if (d.moved) {
            const t = timeAt(e.clientX);
            setSelection({ start: Math.min(d.t0, t), end: Math.max(d.t0, t) });
          }
        }}
        onPointerUp={() => {
          const d = dragRef.current;
          dragRef.current = null;
          if (!d) return;
          if (!d.moved) playClip({ url, start: d.t0, end: duration }); // a plain click plays from there
          else setSelection((s) => (s && s.end - s.start < 0.05 ? null : s));
        }}
      >
        {ready && <canvas ref={canvasRef} style={{ width: "100%", height: WAVE_HEIGHT, display: "block" }} />}
        {ready && <div ref={playheadRef} className="audio-playhead" style={{ display: "none" }} />}
        {load.status === "loading" && <div className="audio-wave-note">Loading waveform…</div>}
        {load.status === "idle" && <div className="audio-wave-note">Waveform loads when this scrolls into view…</div>}
        {load.status === "error" && (
          <div className="audio-wave-note">
            Can't read this file for the waveform and clip tools ({load.message}). It may be on a host that blocks it, or in an unsupported format. Upload the audio to the site to enable clip citations.
          </div>
        )}
      </div>

      {load.status === "error" ? (
        <audio controls preload="none" src={url} data-evidence="" onPlay={pauseMusicAndClips} style={{ width: "100%", maxWidth: 480 }} />
      ) : (
        <div className="audio-controls">
          <button type="button" className="btn" disabled={!ready} onClick={togglePlay}>
            {playing ? "■ Stop" : selection ? "▶ Play selection" : "▶ Play"}
          </button>
          <span className="audio-time">
            {selection ? `${formatTime(selection.start)} – ${formatTime(selection.end)} (${selLen.toFixed(2)} s)` : ready ? `Drag on the waveform to select a passage to cite · ${formatTime(duration)}` : ""}
          </span>
          {selection && selLen >= 0.1 && !citing && (
            <button type="button" className="btn btn-primary" onClick={() => setCiting(true)}>
              ＋ Cite this passage
            </button>
          )}
        </div>
      )}

      {citing && selection && (
        <div className="audio-cite-form">
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void cite();
              if (e.key === "Escape") setCiting(false);
            }}
            placeholder="What should the reader notice here?"
            disabled={busy}
          />
          <label className="audio-range" title="Top of the spectrogram's frequency axis">
            Range
            <select value={String(maxHz)} disabled={busy} onChange={(e) => setMaxHz(e.target.value === "auto" ? "auto" : Number(e.target.value))}>
              <option value="auto">auto</option>
              <option value="2000">0–2 kHz</option>
              <option value="4000">0–4 kHz</option>
              <option value="8000">0–8 kHz</option>
              <option value="16000">0–16 kHz</option>
            </select>
          </label>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void cite()}>
            {busy ? "Rendering spectrogram…" : "Add as note"}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => setCiting(false)}>
            Cancel
          </button>
        </div>
      )}
      <ClipList clips={clips} />
    </div>
  );
}
