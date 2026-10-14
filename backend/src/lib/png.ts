// Just enough PNG reading to refuse anything that is not a small square texture.
export const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const MAX_TEXTURE_BYTES = 100_000;
export const TEXTURE_SIZES = [64, 128, 256];

/** Width and height from the IHDR chunk, or null when the bytes are not a PNG. */
export function pngSize(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 33) return null;
  for (let i = 0; i < 8; i++) if (b[i] !== PNG_SIG[i]) return null;
  if (String.fromCharCode(b[12], b[13], b[14], b[15]) !== "IHDR") return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}
export type TextureCheck = { ok: true; bytes: Buffer } | { ok: false; error: string };
/** Validates an uploaded texture given as a base64 string (with or without the data: prefix). */
export function checkTexture(raw: unknown): TextureCheck {
  if (typeof raw !== "string") return { ok: false, error: "Missing image" };
  const b64 = raw.replace(/^data:image\/png;base64,/, "");
  if (b64.length > MAX_TEXTURE_BYTES * 1.4) return { ok: false, error: "Image is too large" };
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) return { ok: false, error: "Not a PNG" };
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length > MAX_TEXTURE_BYTES) return { ok: false, error: "Image is too large" };
  const sz = pngSize(bytes);
  if (!sz) return { ok: false, error: "Not a PNG" };
  if (sz.w !== sz.h || !TEXTURE_SIZES.includes(sz.w)) return { ok: false, error: "Texture must be a square of 64, 128 or 256 pixels" };
  return { ok: true, bytes };
}

// ---- skies: a 2:1 panorama as PNG or JPEG (the editor composes it from a cube or accepts one wide picture)
export const MAX_SKY_BYTES = 300_000;
export const SKY_SIZES = [512, 1024, 2048];
/** Width and height from a JPEG's first start-of-frame marker, or null. */
export function jpegSize(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}
/** "image/png", "image/jpeg" or null, by signature only. */
export function imageType(b: Uint8Array): "image/png" | "image/jpeg" | null { return pngSize(b) ? "image/png" : jpegSize(b) ? "image/jpeg" : null; }
export function checkSky(raw: unknown): TextureCheck {
  if (typeof raw !== "string") return { ok: false, error: "Missing image" };
  const b64 = raw.replace(/^data:image\/(?:png|jpeg);base64,/, "");
  if (b64.length > MAX_SKY_BYTES * 1.4) return { ok: false, error: "Sky is too large" };
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) return { ok: false, error: "Not a PNG or JPEG" };
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length > MAX_SKY_BYTES) return { ok: false, error: "Sky is too large" };
  const sz = pngSize(bytes) ?? jpegSize(bytes);
  if (!sz) return { ok: false, error: "Not a PNG or JPEG" };
  if (sz.w !== sz.h * 2 || !SKY_SIZES.includes(sz.w)) return { ok: false, error: "A sky must be twice as wide as tall: 512x256, 1024x512 or 2048x1024" };
  return { ok: true, bytes };
}
