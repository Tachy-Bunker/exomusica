/// <reference lib="webworker" />
// Receives a recording as it is captured and builds the voice note while it arrives (enhanced, mono, parked on disk), then, when
// the recording ends, levels it and encodes it (AAC 96 kbps) a piece at a time. No limit on length; memory stays flat.
import { AirwindowsEngine } from "../lib/dsp/airwindows";
import { AacStreamEncoder } from "../lib/dsp/encode";
import { removeStaleSpools } from "../lib/dsp/spool";
import { CHAIN_PRESETS } from "../lib/dsp/voiceChain";
import { VoiceNoteBuilder } from "../lib/dsp/voiceNoteStream";

const MIN_SECONDS = 0.3;

let engine: Promise<AirwindowsEngine> | null = null;
const load = () => (engine ??= fetch("/dsp/airwindows_voice.wasm").then((r) => r.arrayBuffer()).then((b) => AirwindowsEngine.load(b)));

interface Job {
  id: number;
  sampleRate: number;
  builder: VoiceNoteBuilder;
  abort: AbortController;
  writes: Promise<void>;
}
let job: Job | null = null;
void removeStaleSpools(); // files left by a tab that crashed or was closed mid-recording

const say = (m: object) => self.postMessage(m);

self.onmessage = async (e: MessageEvent<{ type: string; id: number; sampleRate?: number; port?: MessagePort }>) => {
  const { type, id } = e.data;
  if (type === "cancel") {
    if (job && job.id === id) {
      const j = job;
      job = null;
      j.abort.abort();
      await j.writes.catch(() => undefined);
      await j.builder.dispose();
    }
    say({ id, type: "cancelled" });
    return;
  }
  if (type !== "begin" || !e.data.port || !e.data.sampleRate) return;

  try {
    const eng = await load();
    const preset = CHAIN_PRESETS.find((p) => p.id === "enhancer") ?? CHAIN_PRESETS[0];
    const abort = new AbortController();
    const builder = await VoiceNoteBuilder.create(eng, preset, e.data.sampleRate, { signal: abort.signal });
    const j: Job = { id, sampleRate: e.data.sampleRate, builder, abort, writes: Promise.resolve() };
    job = j;
    say({ id, type: "ready", spool: builder.spoolKind });
    e.data.port.onmessage = (m: MessageEvent<{ pcm?: Float32Array; end?: boolean }>) => {
      if (job !== j) return;
      if (m.data.pcm) {
        const pcm = m.data.pcm;
        // the effect runs on each piece as it arrives, so the work is already mostly done when the recording stops
        j.writes = j.writes.then(() => j.builder.push(pcm)).catch(async (err) => {
          if (job !== j) return;
          job = null;
          j.abort.abort();
          say({ id, type: "error", message: err instanceof Error ? err.message : String(err) });
          await j.builder.dispose();
        });
      } else if (m.data.end) {
        void finish(j);
      }
    };
  } catch (err) {
    say({ id, type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};

async function finish(j: Job) {
  try {
    await j.writes;
    if (job !== j) return;
    const seconds = j.builder.seconds;
    if (seconds < MIN_SECONDS) {
      say({ id: j.id, type: "error", message: "That was too short. Hold on a little longer and try again." });
      return;
    }
    say({ id: j.id, type: "recorded", seconds });
    const enc = await AacStreamEncoder.create(j.sampleRate, 1);
    let last = 0;
    const stats = await j.builder.finish({ add: (c) => enc.add(c, null) }, (p) => {
      if (p - last >= 0.004 || p === 1) {
        last = p;
        say({ id: j.id, type: "progress", p });
      }
    });
    const bytes = await enc.finish();
    say({ id: j.id, type: "done", blob: new Blob([bytes], { type: "audio/mp4" }), stats, spool: j.builder.spoolKind || "opfs" });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return; // cancelled: the cancel handler answers
    say({ id: j.id, type: "error", message: err instanceof Error ? err.message : String(err) });
  } finally {
    if (job === j) job = null;
    await j.builder.dispose();
  }
}
