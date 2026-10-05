/** Writes stereo 16-bit PCM WAV, the format every audio tool opens. Samples are clamped, then rounded to the nearest step. */
export function encodeWav16(left: Float32Array, right: Float32Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const n = left.length;
  const bytes = new Uint8Array(new ArrayBuffer(44 + n * 4));
  const v = new DataView(bytes.buffer);
  const tag = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  tag(0, "RIFF");
  v.setUint32(4, 36 + n * 4, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 2, true); // channels
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  tag(36, "data");
  v.setUint32(40, n * 4, true);
  const q = (x: number) => Math.max(-32768, Math.min(32767, Math.round(x * 32768)));
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 4, q(left[i]), true);
    v.setInt16(46 + i * 4, q(right[i]), true);
  }
  return bytes;
}
