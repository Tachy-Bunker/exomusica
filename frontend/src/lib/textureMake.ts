// Turning a picture into a room texture: a centred square, shrunk to 128 px (64 if the PNG would be too big for the server).
export async function squareTexture(src: Blob, size = 128): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(src), s = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d");
  if (!g) throw new Error("No canvas");
  g.imageSmoothingQuality = "high"; g.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size); bmp.close();
  return c;
}
export const MAX_B64 = 130_000;
/** The PNG as a data URL; a 128 px picture that is too heavy is redrawn at 64 px. */
export function pngOf(c: HTMLCanvasElement): string {
  let url = c.toDataURL("image/png");
  if (url.length > MAX_B64 && c.width > 64) { const s = document.createElement("canvas"); s.width = s.height = 64; s.getContext("2d")!.drawImage(c, 0, 0, 64, 64); url = s.toDataURL("image/png"); }
  return url;
}
/** The texture repeated 2 x 2 so the owner can judge the seams. */
export function drawSeams(target: HTMLCanvasElement, tex: HTMLCanvasElement): void {
  const g = target.getContext("2d"); if (!g) return; const h = target.width / 2;
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g.drawImage(tex, x * h, y * h, h, h);
}
