// A small zip reader for texture packs: stored and deflated entries only, via the browser's own DecompressionStream (no library).
export interface ZipEntry { name: string; size: number; data: () => Promise<Uint8Array> }
export const MAX_ENTRIES = 200, MAX_ENTRY_BYTES = 8_000_000;

export function listZip(buf: Uint8Array): ZipEntry[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Not a zip file");
  const count = Math.min(dv.getUint16(eocd + 10, true), MAX_ENTRIES);
  let p = dv.getUint32(eocd + 16, true); const out: ZipEntry[] = [];
  for (let k = 0; k < count; k++) {
    if (p + 46 > buf.length || dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), comp = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nl)); p += 46 + nl + el + cl;
    if (name.endsWith("/") || name.startsWith("__MACOSX") || size > MAX_ENTRY_BYTES || (method !== 0 && method !== 8)) continue;
    out.push({ name, size, data: async () => {
      if (off + 30 > buf.length || dv.getUint32(off, true) !== 0x04034b50) throw new Error("Broken zip entry");
      const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), raw = buf.subarray(start, start + comp);
      if (method === 0) return raw;
      const ds = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      const res = new Uint8Array(await new Response(ds).arrayBuffer()); if (res.length > MAX_ENTRY_BYTES) throw new Error("Entry too large"); return res;
    } });
  }
  return out;
}
export const isImageName = (n: string): boolean => /\.(png|jpe?g|webp|gif|bmp)$/i.test(n);
