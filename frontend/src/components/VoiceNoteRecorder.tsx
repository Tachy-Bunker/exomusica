import { useEffect, useRef, useState } from "react";
import captureUrl from "../worklets/capture.worklet.ts?worker&url";
import { TAIL_SECONDS, type VoiceNoteStats } from "../lib/dsp/voiceNote";

export interface FinishedVoiceNote {
  /** The finished note: AAC, mono, 96 kbps. */
  blob: Blob;
  stats: VoiceNoteStats;
  /** When the recording was started. */
  recordedAt: Date;
}

interface Props {
  /** What the button that keeps the note says ("Add to study", "Send"...). */
  doneLabel: string;
  /** Called when the person keeps the note. Throwing shows the message and lets them try again. */
  onDone: (note: FinishedVoiceNote) => Promise<void>;
  onCancel: () => void;
}

type Phase = "idle" | "recording" | "processing" | "ready" | "saving";

const fmt = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};
const MB_PER_MINUTE = (96_000 / 8) * 60 / 1e6; // the finished note is 96 kbps
/** While recording, the enhanced audio is kept on the device at 4 bytes a sample (mono). */
const DISK_MB_PER_MINUTE = (44100 * 4 * 60) / 1e6 * 1.1;
/** Recording stops by itself when less than this much storage is left, so nothing is lost to a failed write. */
const MIN_FREE_MB = 24;
/** The site accepts files up to this size; longer notes record and process fine but can't be uploaded. */
const SITE_UPLOAD_LIMIT_MB = 100;

interface Live {
  stream: MediaStream;
  ctx: AudioContext;
  node: AudioWorkletNode;
  timer: number;
  room: number;
  startedAt: number;
  recordedAt: Date;
}

/** Record a voice note of any length, hear exactly what will be saved, then keep or redo it. */
export function VoiceNoteRecorder({ doneLabel, onDone, onCancel }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState<(FinishedVoiceNote & { url: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spool, setSpool] = useState<string>("");
  const [roomMinutes, setRoomMinutes] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const jobRef = useRef(0);
  const liveRef = useRef<Live | null>(null);
  const urlRef = useRef<string | null>(null);
  const recordedAtRef = useRef<Date>(new Date());

  function releaseUrl() {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }

  function stopCapture(live: Live) {
    window.clearInterval(live.timer);
    window.clearInterval(live.room);
    live.stream.getTracks().forEach((t) => t.stop());
  }

  useEffect(
    () => () => {
      const live = liveRef.current;
      if (live) {
        stopCapture(live);
        void live.ctx.close();
        liveRef.current = null;
      }
      const w = workerRef.current;
      if (w) {
        w.postMessage({ type: "cancel", id: jobRef.current }); // lets it delete its temporary file
        window.setTimeout(() => w.terminate(), 1000);
      }
      releaseUrl();
    },
    [],
  );

  /** How much storage the browser has left for this site, in MB (null when it can't say). */
  async function freeMb(): Promise<number | null> {
    try {
      const e = await navigator.storage?.estimate?.();
      return e && e.quota !== undefined && e.usage !== undefined ? (e.quota - e.usage) / 1e6 : null;
    } catch {
      return null;
    }
  }

  async function start() {
    setError(null);
    setNotice(null);
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    try {
      if (typeof AudioWorkletNode === "undefined") throw new Error("This browser can't record voice notes.");
      // the browser's own voice processing is off: the enhancer should be given the raw voice
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      ctx = new AudioContext();
      await ctx.audioWorklet.addModule(captureUrl);
      const worker = (workerRef.current ??= new Worker(new URL("../workers/voiceNote.worker.ts", import.meta.url), { type: "module" }));
      const id = ++jobRef.current;
      worker.onmessage = (e: MessageEvent<{ id: number; type: string; p?: number; seconds?: number; spool?: string; message?: string; blob?: Blob; stats?: VoiceNoteStats }>) => {
        const m = e.data;
        if (m.id !== jobRef.current) return; // an old job
        if (m.type === "ready") setSpool(m.spool ?? "");
        else if (m.type === "recorded") {
          const live = liveRef.current;
          if (live) {
            void live.ctx.close(); // the last of the audio has arrived
            liveRef.current = null;
          }
        } else if (m.type === "progress") setProgress(m.p ?? 0);
        else if (m.type === "done" && m.blob && m.stats) {
          releaseUrl();
          urlRef.current = URL.createObjectURL(m.blob);
          setNote({ blob: m.blob, stats: m.stats, url: urlRef.current, recordedAt: recordedAtRef.current });
          setPhase("ready");
        } else if (m.type === "error") {
          const live = liveRef.current;
          if (live) {
            stopCapture(live);
            void live.ctx.close();
            liveRef.current = null;
          }
          setError(m.message ?? "Something went wrong.");
          setPhase("idle");
        }
      };
      const channel = new MessageChannel();
      worker.postMessage({ type: "begin", id, sampleRate: ctx.sampleRate, port: channel.port1 }, [channel.port1]);
      const node = new AudioWorkletNode(ctx, "voice-note-capture", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      node.port.postMessage({ type: "port", port: channel.port2 }, [channel.port2]);
      const mute = ctx.createGain(); // the worklet needs a path to the output to be kept running; it writes silence
      mute.gain.value = 0;
      ctx.createMediaStreamSource(stream).connect(node);
      node.connect(mute).connect(ctx.destination);
      await ctx.resume();
      const startedAt = performance.now();
      recordedAtRef.current = new Date();
      const timer = window.setInterval(() => setElapsed((performance.now() - startedAt) / 1000), 200);
      const room = window.setInterval(async () => {
        const free = await freeMb();
        if (free === null || !liveRef.current) return;
        setRoomMinutes(Math.max(0, Math.floor((free - MIN_FREE_MB) / DISK_MB_PER_MINUTE)));
        if (free < MIN_FREE_MB) {
          setNotice("This device is running out of storage, so the recording ended here.");
          stop();
        }
      }, 4000);
      liveRef.current = { stream, ctx, node, timer, room, startedAt, recordedAt: recordedAtRef.current };
      const free0 = await freeMb();
      setRoomMinutes(free0 === null ? null : Math.max(0, Math.floor((free0 - MIN_FREE_MB) / DISK_MB_PER_MINUTE)));
      setElapsed(0);
      setProgress(0);
      setPhase("recording");
    } catch (err) {
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      setError(err instanceof Error && /browser can't record/.test(err.message) ? err.message : "The microphone couldn't be opened. Check that the browser is allowed to use it.");
    }
  }

  function stop() {
    const live = liveRef.current;
    if (!live) return;
    window.clearInterval(live.timer);
    window.clearInterval(live.room);
    live.stream.getTracks().forEach((t) => t.stop());
    live.node.port.postMessage({ type: "stop" }); // flushes the last audio and ends the stream
    setProgress(0);
    setPhase("processing");
  }

  function cancelProcessing() {
    const live = liveRef.current;
    if (live) {
      stopCapture(live);
      void live.ctx.close();
      liveRef.current = null;
    }
    workerRef.current?.postMessage({ type: "cancel", id: jobRef.current });
    jobRef.current++; // anything it says from now on is ignored
    setPhase("idle");
  }

  async function keep() {
    if (!note) return;
    setError(null);
    setPhase("saving");
    try {
      await onDone({ blob: note.blob, stats: note.stats, recordedAt: note.recordedAt });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
      setPhase("ready");
    }
  }

  function again() {
    releaseUrl();
    setNote(null);
    setError(null);
    setPhase("idle");
  }

  const s = note?.stats;
  const estMb = ((elapsed + TAIL_SECONDS) / 60) * MB_PER_MINUTE;
  return (
    <div className="voice-note" data-testid="voice-note" data-spool={spool}>
      {phase === "idle" && (
        <div className="voice-note-row">
          <button className="btn btn-primary" onClick={() => void start()} data-testid="vn-record">
            ● Record a voice note
          </button>
          <button className="btn" onClick={onCancel} data-testid="vn-discard">
            Cancel
          </button>
          <span className="voice-note-hint">There's no time limit. Your voice is enhanced and levelled automatically.</span>
        </div>
      )}
      {phase === "recording" && (
        <div>
          <div className="voice-note-row">
            <button className="btn btn-primary" onClick={stop} data-testid="vn-stop">
              ■ Stop
            </button>
            <span className="voice-note-live" aria-live="polite">
              <span className="voice-note-dot" /> Recording <span data-testid="vn-elapsed">{fmt(elapsed)}</span>
            </span>
            <span className="voice-note-hint" data-testid="vn-size">
              about {estMb < 10 ? estMb.toFixed(1) : Math.round(estMb)} MB when finished
            </span>
            {roomMinutes !== null && roomMinutes < 180 && (
              <span className="voice-note-hint" data-testid="vn-room">
                · this device has room for about {Math.max(0, roomMinutes - Math.floor(elapsed / 60))} more minutes
              </span>
            )}
          </div>
          {estMb > SITE_UPLOAD_LIMIT_MB * 0.9 && (
            <p className="voice-note-warn" data-testid="vn-big">
              This is nearly as long as the site accepts in one file ({SITE_UPLOAD_LIMIT_MB} MB, about {Math.round(SITE_UPLOAD_LIMIT_MB / MB_PER_MINUTE / 60 * 10) / 10} hours). A longer note can still be recorded and downloaded, but it can't be added here.
            </p>
          )}
        </div>
      )}
      {phase === "processing" && (
        <div className="voice-note-row" role="status">
          <span>{progress > 0 ? `Enhancing your voice… ${Math.round(progress * 100)}%` : "Finishing the recording…"}</span>
          <span className="voice-note-bar">
            <span style={{ width: `${Math.round(progress * 100)}%` }} data-testid="vn-progress" />
          </span>
          <button className="btn" onClick={cancelProcessing} data-testid="vn-cancel-processing">
            Cancel
          </button>
        </div>
      )}
      {(phase === "ready" || phase === "saving") && note && s && (
        <div>
          <audio controls src={note.url} data-testid="vn-preview" style={{ width: "100%" }} />
          <p className="voice-note-hint" data-testid="vn-stats" style={{ margin: "0.3rem 0" }}>
            {fmt(s.inputSeconds)} + {TAIL_SECONDS} s fade-out{s.loudnessLufs !== null && <> · {s.loudnessLufs.toFixed(1)} LUFS</>} · mono · {(note.blob.size / 1e6).toFixed(1)} MB
          </p>
          {s.tooQuiet && <p className="voice-note-warn">That recording is silent. Check that the right microphone is selected.</p>}
          {s.gainCapped && !s.tooQuiet && <p className="voice-note-warn">That was very quiet, so it has been boosted as far as it can be. Try speaking closer to the microphone.</p>}
          <div className="voice-note-row">
            <button className="btn btn-primary" onClick={() => void keep()} disabled={phase === "saving" || s.tooQuiet} data-testid="vn-done">
              {phase === "saving" ? "Saving…" : doneLabel}
            </button>
            <button className="btn" onClick={again} disabled={phase === "saving"} data-testid="vn-again">
              Record again
            </button>
            <button className="btn" onClick={onCancel} disabled={phase === "saving"} data-testid="vn-discard">
              Discard
            </button>
          </div>
        </div>
      )}
      {notice && phase !== "recording" && phase !== "idle" && (
        <p className="voice-note-warn" data-testid="vn-notice">
          {notice}
        </p>
      )}
      {error && (
        <p className="voice-note-warn" role="alert" data-testid="vn-error">
          {error}
        </p>
      )}
    </div>
  );
}
