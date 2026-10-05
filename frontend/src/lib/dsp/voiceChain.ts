import { AirwindowsEngine, type PluginInstance } from "./airwindows";

/**
 * A chain of Airwindows plugins with fixed parameters. `raw` values are what the plugin stores (0 to 1);
 * `shown` records what the host displayed when the chain was set up, so a preset can always be traced back
 * to the settings it came from.
 */
export interface ChainPreset {
  id: string;
  name: string;
  description: string;
  plugins: { plugin: string; role: string; raw: number[]; shown: string[] }[];
}

/** Tachy's voice chain, in the order it sits on the mixer insert. Applied before loudness normalisation. */
export const VOICE_CHAIN: ChainPreset = {
  id: "tachy-voice",
  name: "Tachy voice",
  description: "Energy2 → SlewSonic → AverMatrix → FathomFive → Pressure5 → Galactic3, as set up in FL Studio",
  plugins: [
    { plugin: "Energy2", role: "controlled electrifier", raw: [0.749996, 0.8805665, 0.38854, 0.358285, 0.5, 0.38376, 0.5, 0.5, 1.0], shown: ["0.499992", "0.761133", "-0.22292", "-0.28343", "0.000000", "-0.23248", "0.000000", "0.000000", "1.000000"] },
    { plugin: "SlewSonic", role: "glitter solo", raw: [0.928337, 0.0207], shown: ["23.56674 kHz", "0.020700"] },
    { plugin: "AverMatrix", role: "organic eq", raw: [0.2786579, 0.1130552, 0.6449095], shown: ["3.507921 taps", "2.017497 poles", "0.289819"] },
    { plugin: "FathomFive", role: "analog bass control", raw: [0.785035, 0.0, 0.810504, 0.111477], shown: ["0.785035", "0.000000", "0.810504", "0.111477"] },
    { plugin: "Pressure5", role: "super squisher", raw: [0.291397, 0.0, 0.0, 1.0, 0.5, 1.0], shown: ["0.291397", "0.000000", "0.000000", "1.000000", "0.500000", "1.000000"] },
    { plugin: "Galactic3", role: "muzak mall verb", raw: [0.765918, 0.625794, 0.5, 1.0, 0.164025, 0.058931], shown: ["0.765918", "0.625794", "0.500000", "1.000000", "0.164025", "0.058931"] },
  ],
};

export const CHAIN_PRESETS: ChainPreset[] = [VOICE_CHAIN];

export interface RunOptions {
  /** Frames per block. Results don't depend on it (Airwindows plugins are block-size independent); 128 matches an AudioWorklet. */
  block?: number;
  /** Seeds the plugins' output dither, so a render is repeatable. */
  seed?: number;
  /** Called between blocks with 0-1, so a UI can show progress and stay responsive. */
  onProgress?: (done: number) => void;
}

/** Builds the chain's plugins for a sample rate, ready to process. Call destroy() when finished. */
export class Chain {
  private instances: PluginInstance[];

  constructor(engine: AirwindowsEngine, readonly preset: ChainPreset, sampleRate: number, seed = 1) {
    this.instances = preset.plugins.map((p, i) => {
      const inst = engine.create(p.plugin, sampleRate, seed + i);
      p.raw.forEach((v, k) => inst.setParam(k, v));
      return inst;
    });
  }

  /** Processes stereo audio in place, one block (up to 4096 frames) at a time. */
  processBlock(left: Float32Array, right: Float32Array) {
    for (const inst of this.instances) inst.process(left, right);
  }

  destroy() {
    for (const inst of this.instances) inst.destroy();
  }
}

/**
 * Runs a preset over a whole recording. A mono voice is fed to both channels, as a mixer insert would; the
 * returned pair differs only where the chain widens the sound (the reverb).
 */
export function runChain(engine: AirwindowsEngine, preset: ChainPreset, sampleRate: number, left: Float32Array, right: Float32Array | null = null, opts: RunOptions = {}): { left: Float32Array; right: Float32Array } {
  const block = opts.block ?? 512;
  const l = Float32Array.from(left);
  const r = Float32Array.from(right ?? left);
  const chain = new Chain(engine, preset, sampleRate, opts.seed ?? 1);
  try {
    for (let pos = 0; pos < l.length; pos += block) {
      const end = Math.min(l.length, pos + block);
      chain.processBlock(l.subarray(pos, end), r.subarray(pos, end));
      opts.onProgress?.(end / l.length);
    }
  } finally {
    chain.destroy();
  }
  return { left: l, right: r };
}
