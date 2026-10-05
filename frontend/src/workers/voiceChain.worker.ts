/// <reference lib="webworker" />
// Runs a chain of Airwindows plugins over a recording off the main thread, so the page stays responsive.
import { AirwindowsEngine } from "../lib/dsp/airwindows";
import { CHAIN_PRESETS, runChain } from "../lib/dsp/voiceChain";

interface Request {
  id: number;
  presetId: string;
  sampleRate: number;
  left: Float32Array;
  right: Float32Array | null;
  seed?: number;
}

let engine: Promise<AirwindowsEngine> | null = null;
const load = () => (engine ??= fetch("/dsp/airwindows_voice.wasm").then((r) => r.arrayBuffer()).then((b) => AirwindowsEngine.load(b)));

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, presetId, sampleRate, left, right, seed } = e.data;
  try {
    const preset = CHAIN_PRESETS.find((p) => p.id === presetId);
    if (!preset) throw new Error(`Unknown chain "${presetId}"`);
    const eng = await load();
    const out = runChain(eng, preset, sampleRate, left, right, { seed, block: 4096, onProgress: (p) => self.postMessage({ id, progress: p }) });
    self.postMessage({ id, left: out.left, right: out.right }, [out.left.buffer, out.right.buffer]);
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
