/** A small seamless dark mossy tile for behind the door's spikes, drawn once on first use (a few thousand pixels) and kept as a data URL. */
let tile: string | null | undefined;
export function doorTexture(size = 64): string | null {
  if (tile !== undefined) return tile;
  tile = null;
  try {
    const cv = document.createElement("canvas"); cv.width = cv.height = size;
    const g = cv.getContext("2d"); if (!g) return null;
    const img = g.createImageData(size, size);
    // periodic value noise at three scales, so the tile repeats without a seam
    let seed = 1337; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const lattice = (n: number) => Array.from({ length: n * n }, () => rnd());
    const layers = [{ n: 4, w: 0.5, v: lattice(4) }, { n: 8, w: 0.3, v: lattice(8) }, { n: 16, w: 0.2, v: lattice(16) }];
    const smooth = (t: number) => t * t * (3 - 2 * t);
    const sample = (L: { n: number; v: number[] }, x: number, y: number) => {
      const fx = (x / size) * L.n, fy = (y / size) * L.n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = smooth(fx - x0), ty = smooth(fy - y0);
      const at = (i: number, j: number) => L.v[(j % L.n) * L.n + (i % L.n)];
      return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
    };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const v = layers.reduce((s, L) => s + L.w * sample(L, x, y), 0), k = (y * size + x) * 4;
      img.data[k] = 8 + v * 22; img.data[k + 1] = 14 + v * 34; img.data[k + 2] = 12 + v * 26; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    tile = cv.toDataURL("image/png");
  } catch { tile = null; }
  return tile;
}
