/** Writes 16-bit PCM WAV (stereo, or mono when `right` is null), the format every audio tool opens. Samples are clamped, then rounded to the nearest step. */
export function encodeWav16(left: Float32Array, right: Float32Array | null, sampleRate: number): Uint8Array<ArrayBuffer> {
  const n = left.length;
  const ch = right ? 2 : 1;
  const frame = ch * 2;
  const bytes = new Uint8Array(new ArrayBuffer(44 + n * frame));
  const v = new DataView(bytes.buffer);
  const tag = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  tag(0, "RIFF");
  v.setUint32(4, 36 + n * frame, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, ch, true); // channels
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * frame, true);
  v.setUint16(32, frame, true);
  v.setUint16(34, 16, true);
  tag(36, "data");
  v.setUint32(40, n * frame, true);
  const q = (x: number) => Math.max(-32768, Math.min(32767, Math.round(x * 32768)));
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * frame, q(left[i]), true);
    if (right) v.setInt16(46 + i * frame, q(right[i]), true);
  }
  return bytes;
}
