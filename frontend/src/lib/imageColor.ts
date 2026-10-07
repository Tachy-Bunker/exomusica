// The average colour of a picture: what a branch's colour becomes when an admin chooses its main image. Pure maths, plus one browser helper.

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

/** The average of the visible pixels (RGBA bytes); pixels that are almost transparent don't count. Null if there are none. */
export function averageColor(rgba: ArrayLike<number>): string | null {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 16) continue;
    r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; n++;
  }
  return n === 0 ? null : `#${hex2(r / n)}${hex2(g / n)}${hex2(b / n)}`;
}

/** Loads a picture from this site and averages its colours on a tiny canvas. Null if it can't be read (another site's picture may not allow it). */
export function colorFromImageUrl(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        resolve(averageColor(ctx.getImageData(0, 0, size, size).data));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
