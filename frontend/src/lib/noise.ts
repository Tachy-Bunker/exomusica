// One-dimensional gradient (Perlin) noise: smooth, repeatable wandering from a single number. Output is in -1..1.
const PERM = (() => {
  const p = new Uint8Array(512);
  let s = 1234567;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const base = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [base[i], base[j]] = [base[j], base[i]]; }
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  return p;
})();
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const grad = (h: number, x: number) => ((h & 1) === 0 ? x : -x) * (1 + (h >> 1 & 3) * 0.25);

export function perlin1(x: number): number {
  const xi = Math.floor(x);
  const xf = x - xi;
  const a = PERM[xi & 255], b = PERM[(xi + 1) & 255];
  const v = (1 - fade(xf)) * grad(a, xf) + fade(xf) * grad(b, xf - 1);
  return Math.max(-1, Math.min(1, v * 1.6));
}
