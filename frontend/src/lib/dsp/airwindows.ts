// Runs the original Airwindows plugins (compiled to WebAssembly, see frontend/wasm/airwindows) on audio buffers.
// Works anywhere WebAssembly does: the browser (ideally in a Web Worker), Node, and a future offline app.

export interface ParamInfo {
  name: string;
  /** What the plugin itself shows for the current value (e.g. "23.5667"). */
  display: string;
  label: string;
}

const MAX_BLOCK = 4096;

interface Exports {
  memory: WebAssembly.Memory;
  _initialize: () => void;
  aw_count: () => number;
  aw_name: (id: number) => number;
  aw_param_count: (id: number) => number;
  aw_create: (id: number, sampleRate: number, seed: number) => number;
  aw_destroy: (h: number) => void;
  aw_set_param: (h: number, i: number, v: number) => void;
  aw_get_param: (h: number, i: number) => number;
  aw_param_name: (h: number, i: number, out: number) => void;
  aw_param_display: (h: number, i: number, out: number) => void;
  aw_param_label: (h: number, i: number, out: number) => void;
  aw_process: (h: number, inL: number, inR: number, outL: number, outR: number, n: number) => void;
  aw_alloc: (bytes: number) => number;
  aw_free: (p: number) => void;
}

export class AirwindowsEngine {
  private constructor(private x: Exports) {}

  static async load(source: BufferSource | WebAssembly.Module): Promise<AirwindowsEngine> {
    // the module only imports three file-handling functions that audio processing never calls
    const wasi = new Proxy({}, { get: () => () => 0 });
    const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
    const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi as WebAssembly.ModuleImports });
    const x = instance.exports as unknown as Exports;
    x._initialize();
    return new AirwindowsEngine(x);
  }

  private cstr(ptr: number): string {
    const mem = new Uint8Array(this.x.memory.buffer);
    let end = ptr;
    while (mem[end] !== 0) end++;
    return new TextDecoder().decode(mem.subarray(ptr, end));
  }

  /** Size of the module's memory, for monitoring leaks. */
  memoryBytes(): number {
    return this.x.memory.buffer.byteLength;
  }

  pluginNames(): string[] {
    return Array.from({ length: this.x.aw_count() }, (_, i) => this.cstr(this.x.aw_name(i)));
  }

  create(plugin: string, sampleRate: number, seed = 1): PluginInstance {
    const id = this.pluginNames().indexOf(plugin);
    if (id < 0) throw new Error(`Unknown plugin "${plugin}"`);
    return new PluginInstance(this.x, id, sampleRate, seed);
  }
}

export class PluginInstance {
  readonly paramCount: number;
  private handle: number;
  private bufs: number;
  private text: number;

  constructor(private x: Exports, id: number, sampleRate: number, seed: number) {
    this.handle = x.aw_create(id, sampleRate, seed);
    this.paramCount = x.aw_param_count(id);
    this.bufs = x.aw_alloc(4 * MAX_BLOCK * 4); // inL, inR, outL, outR
    this.text = x.aw_alloc(128);
  }

  setParam(index: number, raw: number) {
    this.x.aw_set_param(this.handle, index, raw);
  }

  getParam(index: number): number {
    return this.x.aw_get_param(this.handle, index);
  }

  /** Name, display text and unit of every parameter, as the plugin itself reports them. */
  params(): ParamInfo[] {
    const read = (fn: (h: number, i: number, out: number) => void, i: number) => {
      fn(this.handle, i, this.text);
      const mem = new Uint8Array(this.x.memory.buffer);
      let end = this.text;
      while (mem[end] !== 0) end++;
      return new TextDecoder().decode(mem.subarray(this.text, end)).trim();
    };
    return Array.from({ length: this.paramCount }, (_, i) => ({
      name: read(this.x.aw_param_name, i),
      display: read(this.x.aw_param_display, i),
      label: read(this.x.aw_param_label, i),
    }));
  }

  /** Processes up to 4096 frames of stereo audio in place. */
  process(left: Float32Array, right: Float32Array) {
    const n = left.length;
    if (n > MAX_BLOCK || right.length !== n) throw new Error(`blocks must match and be at most ${MAX_BLOCK} frames`);
    const f = (k: number) => this.bufs + k * MAX_BLOCK * 4;
    const view = (k: number) => new Float32Array(this.x.memory.buffer, f(k), n);
    view(0).set(left);
    view(1).set(right);
    this.x.aw_process(this.handle, f(0), f(1), f(2), f(3), n);
    left.set(view(2));
    right.set(view(3));
  }

  destroy() {
    this.x.aw_destroy(this.handle);
    this.x.aw_free(this.bufs);
    this.x.aw_free(this.text);
  }
}
