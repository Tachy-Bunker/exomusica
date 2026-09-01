import { vertexSrc, fieldFragmentSrc } from "./shaders";

export interface FieldSource {
  x: number;
  y: number;
  amp: number;
  phase: number;
}

export interface FieldRipple {
  x: number;
  y: number;
  age: number; // 0..1
  amp: number;
}

export interface FieldFlyer {
  x: number;
  y: number;
  amp: number;
}

export interface FieldRenderState {
  pointerX: number; // CSS px, spacemap-relative, origin at center (matches prototype's toClipXY output)
  pointerY: number;
  time: number; // ms
  seed: number;
  split: number; // 0..1
  chaos: number; // 0..1
  lurk: number; // 0..1
  bgBright: number; // already prototype-scaled: slider/100 * 2.0, so 50 -> 1.0 neutral
  bgSat: number;
  bgContrast: number;
  sources: FieldSource[]; // up to 24 (wardens + active ripples share this array in the prototype)
  ripples: FieldRipple[]; // up to 4
  flyers: FieldFlyer[]; // up to 6
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(sh));
  }
  return sh;
}

export class FieldRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null;
  private program: WebGLProgram | null = null;
  private cssWidth = 1; // last width passed to resize() — the prototype scales the pointer uniform by this directly, not by anything derived from dpr

  private uResolution: WebGLUniformLocation | null = null;
  private uPointer: WebGLUniformLocation | null = null;
  private uTime: WebGLUniformLocation | null = null;
  private uSeed: WebGLUniformLocation | null = null;
  private uSplit: WebGLUniformLocation | null = null;
  private uChaos: WebGLUniformLocation | null = null;
  private uLurk: WebGLUniformLocation | null = null;
  private uBgBright: WebGLUniformLocation | null = null;
  private uBgSat: WebGLUniformLocation | null = null;
  private uBgContrast: WebGLUniformLocation | null = null;
  private uSourceCount: WebGLUniformLocation | null = null;
  private uFlyerCount: WebGLUniformLocation | null = null;
  private uRippleCount: WebGLUniformLocation | null = null;
  private uSources: (WebGLUniformLocation | null)[] = [];
  private uFlyerLens: (WebGLUniformLocation | null)[] = [];
  private uRipples: (WebGLUniformLocation | null)[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
    });
    if (!this.gl) return;
    const gl = this.gl;

    this.program = gl.createProgram()!;
    gl.attachShader(this.program, compile(gl, gl.VERTEX_SHADER, vertexSrc));
    gl.attachShader(this.program, compile(gl, gl.FRAGMENT_SHADER, fieldFragmentSrc));
    gl.linkProgram(this.program);
    gl.useProgram(this.program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(this.program, "position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    this.uResolution = gl.getUniformLocation(this.program, "resolution");
    this.uPointer = gl.getUniformLocation(this.program, "pointer");
    this.uTime = gl.getUniformLocation(this.program, "time");
    this.uSeed = gl.getUniformLocation(this.program, "uSeed");
    this.uSplit = gl.getUniformLocation(this.program, "uSplit");
    this.uChaos = gl.getUniformLocation(this.program, "uChaos");
    this.uLurk = gl.getUniformLocation(this.program, "uLurk");
    this.uBgBright = gl.getUniformLocation(this.program, "uBgBright");
    this.uBgSat = gl.getUniformLocation(this.program, "uBgSat");
    this.uBgContrast = gl.getUniformLocation(this.program, "uBgContrast");
    this.uSourceCount = gl.getUniformLocation(this.program, "sourceCount");
    this.uFlyerCount = gl.getUniformLocation(this.program, "uFlyerCount");
    this.uRippleCount = gl.getUniformLocation(this.program, "uRippleCount");
    for (let i = 0; i < 24; i++) this.uSources.push(gl.getUniformLocation(this.program, `sources[${i}]`));
    for (let i = 0; i < 6; i++) this.uFlyerLens.push(gl.getUniformLocation(this.program, `uFlyerLens[${i}]`));
    for (let i = 0; i < 4; i++) this.uRipples.push(gl.getUniformLocation(this.program, `uRipples[${i}]`));
  }

  get isAvailable(): boolean {
    return !!this.gl;
  }

  /** Sub-native resolution scale, ported as-is from the prototype: renders
   *  at ~0.4-0.62x device pixels, CSS upscales the canvas back to full
   *  size. This is most of the prototype's performance headroom — step 6
   *  is where this becomes device-tier-aware, not here. */
  resize(cssWidth: number, cssHeight: number): void {
    this.cssWidth = cssWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.4);
    const maxPixels = 480000;
    const fit = Math.sqrt(maxPixels / (cssWidth * cssHeight));
    const bgScale = Math.max(0.4, Math.min(0.62, dpr, fit));
    this.canvas.width = Math.max(1, (cssWidth * bgScale) | 0);
    this.canvas.height = Math.max(1, (cssHeight * bgScale) | 0);
    if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  render(state: FieldRenderState): void {
    const gl = this.gl;
    if (!gl || !this.program) return;

    gl.uniform2f(this.uResolution, this.canvas.width, this.canvas.height);
    // Matches the prototype exactly: `pointerX * fieldCanvas.width / innerWidth`
    // — scaled by the canvas's *own* render-target width over the real CSS
    // window width, not by anything derived from devicePixelRatio.
    gl.uniform2f(this.uPointer, (state.pointerX * this.canvas.width) / this.cssWidth, (state.pointerY * this.canvas.width) / this.cssWidth);
    gl.uniform1f(this.uTime, state.time * 0.001);
    gl.uniform1f(this.uSeed, state.seed);
    gl.uniform1f(this.uSplit, state.split);
    gl.uniform1f(this.uChaos, state.chaos);
    gl.uniform1f(this.uLurk, state.lurk);
    gl.uniform1f(this.uBgBright, state.bgBright);
    gl.uniform1f(this.uBgSat, state.bgSat);
    gl.uniform1f(this.uBgContrast, state.bgContrast);

    let n = 0;
    for (const s of state.sources) {
      if (n >= 24) break;
      gl.uniform4f(this.uSources[n], s.x, s.y, s.amp, s.phase);
      n++;
    }
    gl.uniform1i(this.uSourceCount, n);

    let rn = 0;
    for (const rp of state.ripples) {
      if (rn >= 4) break;
      gl.uniform4f(this.uRipples[rn], rp.x, rp.y, rp.age, rp.amp);
      rn++;
    }
    gl.uniform1i(this.uRippleCount, rn);

    let fn = 0;
    for (const f of state.flyers) {
      if (fn >= 6) break;
      gl.uniform3f(this.uFlyerLens[fn], f.x, f.y, f.amp);
      fn++;
    }
    gl.uniform1i(this.uFlyerCount, fn);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose(): void {
    if (!this.gl || !this.program) return;
    this.gl.deleteProgram(this.program);
    this.program = null;
  }
}
