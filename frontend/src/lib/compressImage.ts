/** Compresses an image file down to fit under maxBytes, entirely in the
 *  browser via canvas re-encoding - first by lowering JPEG quality, then
 *  by downscaling dimensions if quality reduction alone isn't enough
 *  (very large source images can still exceed the target even at low
 *  quality). Non-image files, or anything that fails to decode, are
 *  returned unchanged so the caller's existing size check still applies
 *  as a fallback. */
export async function compressImageToMaxSize(file: File, maxBytes: number): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= maxBytes) return file; // already small enough, don't bother re-encoding

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // couldn't decode - let the normal upload path handle/reject it
  }

  let width = bitmap.width;
  let height = bitmap.height;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  async function encodeAt(w: number, h: number, quality: number): Promise<Blob | null> {
    canvas.width = w;
    canvas.height = h;
    ctx!.clearRect(0, 0, w, h);
    ctx!.drawImage(bitmap, 0, 0, w, h);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  }

  // Pass 1: hold dimensions, step quality down.
  let best: Blob | null = null;
  for (const quality of [0.85, 0.7, 0.55, 0.4, 0.25]) {
    const blob = await encodeAt(width, height, quality);
    if (!blob) continue;
    best = blob;
    if (blob.size <= maxBytes) break;
  }

  // Pass 2: quality alone wasn't enough - scale dimensions down too,
  // re-trying a moderate quality at each smaller size.
  while (best && best.size > maxBytes && (width > 128 || height > 128)) {
    width = Math.round(width * 0.75);
    height = Math.round(height * 0.75);
    const blob = await encodeAt(width, height, 0.7);
    if (blob) best = blob;
  }

  bitmap.close();
  if (!best) return file;
  return new File([best], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}
