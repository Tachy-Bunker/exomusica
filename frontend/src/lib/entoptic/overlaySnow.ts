import { vertexSrc, overlayFragmentSrc } from "./shaders";

export interface OverlaySnowState {
  time: number; // ms
  staticAmt: number; // 0..1
  staticSpeed: number; // 0..1
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

export class OverlaySnowRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null;
  private program: WebGLProgram | null = null;
  private uTime: WebGLUniformLocation | null = null;
  private uStaticAmt: WebGLUniformLocation | null = null;
  private uStaticSpeed: WebGLUniformLocation | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!this.gl) return;
    const gl = this.gl;

    this.program = gl.createProgram()!;
    gl.attachShader(this.program, compile(gl, gl.VERTEX_SHADER, vertexSrc));
    gl.attachShader(this.program, compile(gl, gl.FRAGMENT_SHADER, overlayFragmentSrc));
    gl.linkProgram(this.program);
    gl.useProgram(this.program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(this.program, "position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    this.uTime = gl.getUniformLocation(this.program, "time");
    this.uStaticAmt = gl.getUniformLocation(this.program, "uStaticAmt");
    this.uStaticSpeed = gl.getUniformLocation(this.program, "uStaticSpeed");
  }

  get isAvailable(): boolean {
    return !!this.gl;
  }

  // Same sub-native scale as the main field, matching the prototype
  // (overlay canvas is sized off the identical bgScale computation).
  resize(cssWidth: number, cssHeight: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.4);
    const maxPixels = 480000;
    const fit = Math.sqrt(maxPixels / (cssWidth * cssHeight));
    const bgScale = Math.max(0.4, Math.min(0.62, dpr, fit));
    this.canvas.width = Math.max(1, (cssWidth * bgScale) | 0);
    this.canvas.height = Math.max(1, (cssHeight * bgScale) | 0);
    if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  render(state: OverlaySnowState): void {
    const gl = this.gl;
    if (!gl || !this.program) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(this.uTime, state.time * 0.001);
    gl.uniform1f(this.uStaticAmt, state.staticAmt);
    gl.uniform1f(this.uStaticSpeed, state.staticSpeed);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose(): void {
    if (!this.gl || !this.program) return;
    this.gl.deleteProgram(this.program);
    this.program = null;
  }
}
