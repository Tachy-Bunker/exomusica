/** Shrinks a picture to at most `max` pixels on the long side before it is sent: pasted screenshots are often several MB, and a profile picture never needs more. */
export async function shrinkImage(file: Blob, max = 512, limitBytes = 900_000): Promise<Blob> {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error("Only JPG, PNG or WEBP pictures");
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file); } catch { throw new Error("That picture couldn't be read"); }
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size <= limitBytes) { bmp.close(); return file; } // already small: send it untouched
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d"); if (!ctx) { bmp.close(); throw new Error("Couldn't prepare the picture"); }
  ctx.drawImage(bmp, 0, 0, w, h); bmp.close();
  for (const q of [0.88, 0.75, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", q));
    if (blob && blob.type === "image/webp" && blob.size <= limitBytes) return blob;
    if (blob && blob.type !== "image/webp") { // a browser without webp encoding falls back to png: use jpeg instead
      const jpg = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", q));
      if (jpg && jpg.size <= limitBytes) return jpg;
    }
  }
  throw new Error("That picture is too large even after shrinking");
}

/** An image the clipboard or a drop carries, if any. */
export function imageFrom(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const f of Array.from(data.files)) if (f.type.startsWith("image/")) return f;
  for (const it of Array.from(data.items)) if (it.kind === "file" && it.type.startsWith("image/")) return it.getAsFile();
  return null;
}

/** A pasted address that points at a file already on this site, as a path (or null). */
export function hostedPathFrom(text: string): string | null {
  const t = text.trim();
  try {
    const u = new URL(t, window.location.origin);
    if (u.origin === window.location.origin && u.pathname.startsWith("/uploads/")) return u.pathname;
  } catch { /* not an address */ }
  return null;
}
