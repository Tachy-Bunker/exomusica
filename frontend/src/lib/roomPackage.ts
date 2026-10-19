// Room packages (.exoroom): one room, the pictures it uses, and the prefab library, in a zip with a manifest.
// Pure: no network, no DOM. Written as stored (uncompressed) entries: the pictures are already compressed and the JSON is small,
// so storing is the cheapest thing a weak device can do. Reading uses the zip reader that the texture packs use (stored or deflated).
import { cleanDoc, isUpload, MAX_TEX, type RoomDoc } from "./roomDoc";
import { prefabSlug } from "./roomPrefab";
import { listZip } from "./zipRead";

export const PKG_FORMAT = "exoroom", PKG_VERSION = 1;
export const MAX_PKG_BYTES = 8_000_000, MAX_DOC_BYTES = 200_000, MAX_PIC_BYTES = 300_000, MAX_PREFABS = 100, MAX_PKG_PICS = MAX_TEX + 1; // +1: the sky

export type Scope = "room" | "corridor";
export interface PkgPic { id: number; name: string; sky: boolean; sha256: string; file: string }
export interface Manifest { format: string; version: number; scope: Scope; room: string; exported: string; pictures: PkgPic[]; prefabs: { name: string; file: string }[] }
/** A picture in memory. `id` is the id it had where it was exported; the importer maps it to the library's own id. */
export interface PicData { id: number; name: string; sky: boolean; sha256: string; bytes: Uint8Array }
export interface PkgPrefab { name: string; doc: RoomDoc }
export interface Package { manifest: Manifest; room: RoomDoc; pictures: PicData[]; prefabs: PkgPrefab[]; warnings: string[] }

// ---- bytes

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(b: Uint8Array): number { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

export async function sha256Hex(b: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource));
  return Array.from(d, (x) => x.toString(16).padStart(2, "0")).join("");
}
/** Base64 for the texture upload, in chunks so a large picture does not overflow the argument list. */
export function toBase64(b: Uint8Array): string { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); }
/** The picture's format from its first bytes: PNG or JPEG. Anything else is not a picture. */
export function picExt(b: Uint8Array): "png" | "jpg" | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  return null;
}
function concat(parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((s, p) => s + p.length, 0), out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** A zip of stored entries, names in UTF-8. Readable by any zip tool and by `listZip`. */
export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder(), parts: Uint8Array[] = [], central: Uint8Array[] = [];
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true);
    h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true);
    c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + size;
  }
  const cd = central.reduce((s, p) => s + p.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cd, true); end.setUint32(16, off, true);
  return concat([...parts, ...central, new Uint8Array(end.buffer)]);
}

// ---- the room's references

/** The picture ids a room uses: its floor and wall materials (`u<id>`) and its sky. */
export function collectPictureIds(doc: RoomDoc): Set<number> {
  const ids = new Set<number>();
  for (const t of doc.tex) if (isUpload(t.kind)) ids.add(Number(t.kind.slice(1)));
  if (doc.sky) ids.add(doc.sky.id);
  return ids;
}
/** The room with its picture references rewritten: `map` gives the new id of each old one. A reference that is not in the map falls back
 *  to the plain noise pattern (a sky is dropped); `missing` counts them. The result is cleaned, as a save would clean it. */
export function remapDoc(doc: RoomDoc, map: ReadonlyMap<number, number>): { doc: RoomDoc; missing: number } {
  let missing = 0;
  const tex = doc.tex.map((t) => {
    if (!isUpload(t.kind)) return t;
    const to = map.get(Number(t.kind.slice(1)));
    if (to !== undefined) return { ...t, kind: "u" + to };
    missing++; return { ...t, kind: "noise" };
  });
  let sky = doc.sky;
  if (sky) { const to = map.get(sky.id); if (to !== undefined) sky = { ...sky, id: to }; else { missing++; sky = null; } }
  return { doc: cleanDoc({ ...doc, tex, sky }), missing };
}
/** Which package pictures the library already has (same SHA-256: reuse its id), which are new (upload), and which repeat a new one in the same package (alias). */
export function planPictures(pics: readonly PicData[], library: readonly { id: number; sha256: string }[]): { reuse: Map<number, number>; alias: Map<number, number>; upload: PicData[] } {
  const bySha = new Map<string, number>();
  for (const l of library) if (l.sha256 && !bySha.has(l.sha256)) bySha.set(l.sha256, l.id);
  const reuse = new Map<number, number>(), alias = new Map<number, number>(), upload: PicData[] = [];
  for (const p of pics) {
    const have = bySha.get(p.sha256);
    if (have !== undefined) { reuse.set(p.id, have); continue; }
    const first = upload.find((q) => q.sha256 === p.sha256);
    if (first) { alias.set(p.id, first.id); continue; }
    upload.push(p);
  }
  return { reuse, alias, upload };
}

// ---- writing

export function exportName(slug: string): string { return slug.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") + ".exoroom"; }

export async function buildPackage(o: { room: string; scope: Scope; doc: RoomDoc; pictures: PicData[]; prefabs: PkgPrefab[]; exported?: string }): Promise<Uint8Array> {
  const enc = new TextEncoder(), files: { name: string; data: Uint8Array }[] = [];
  const manifest: Manifest = { format: PKG_FORMAT, version: PKG_VERSION, scope: o.scope, room: o.room, exported: o.exported ?? new Date().toISOString(), pictures: [], prefabs: [] };
  for (const p of o.pictures) {
    const ext = picExt(p.bytes);
    if (!ext) throw new Error(`Picture ${p.id} is not a PNG or JPEG.`);
    const file = `pictures/${p.id}.${ext}`;
    manifest.pictures.push({ id: p.id, name: p.name, sky: p.sky, sha256: p.sha256 || await sha256Hex(p.bytes), file });
    files.push({ name: file, data: p.bytes });
  }
  for (const f of o.prefabs) {
    const name = prefabSlug(f.name), file = `prefabs/${name}.json`;
    manifest.prefabs.push({ name, file });
    files.push({ name: file, data: enc.encode(JSON.stringify(f.doc)) });
  }
  files.unshift({ name: "manifest.json", data: enc.encode(JSON.stringify(manifest)) }, { name: "room.json", data: enc.encode(JSON.stringify({ ...o.doc, version: 0 })) });
  return zipStore(files);
}

// ---- reading

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const cleanName = (v: unknown): string => String(v ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 60);

/** Opens a package and checks everything: the format and version, the sizes, each picture's checksum and type, and the room document.
 *  Throws with a sentence for the editor to show when the package cannot be used. A broken prefab is skipped with a warning. */
export async function readPackage(buf: Uint8Array): Promise<Package> {
  if (buf.length > MAX_PKG_BYTES) throw new Error(`This package is larger than ${MAX_PKG_BYTES / 1_000_000} MB.`);
  let entries;
  try { entries = listZip(buf); } catch { throw new Error("This is not a room package: it is not a zip file."); }
  const byName = new Map(entries.map((e) => [e.name, e]));
  const read = async (name: string, max: number): Promise<string> => {
    const e = byName.get(name);
    if (!e) throw new Error(`The package has no ${name}.`);
    if (e.size > max) throw new Error(`${name} is too large.`);
    return new TextDecoder().decode(await e.data());
  };
  const json = async (name: string, max: number): Promise<unknown> => {
    const text = await read(name, max);
    try { return JSON.parse(text); } catch { throw new Error(`${name} is damaged.`); }
  };

  const m = await json("manifest.json", 50_000);
  if (!isObj(m) || m.format !== PKG_FORMAT) throw new Error("This is not a room package.");
  if (m.version !== PKG_VERSION) throw new Error(`This package is format version ${String(m.version)}. This editor reads version ${PKG_VERSION} only.`);
  if (m.scope !== "room" && m.scope !== "corridor") throw new Error("The package does not say whether it is a room or a corridor.");
  if (!Array.isArray(m.pictures) || m.pictures.length > MAX_PKG_PICS) throw new Error(`The package has more than ${MAX_PKG_PICS} pictures.`);
  if (!Array.isArray(m.prefabs) || m.prefabs.length > MAX_PREFABS) throw new Error(`The package has more than ${MAX_PREFABS} prefabs.`);

  const room = cleanDoc(await json("room.json", MAX_DOC_BYTES));
  const warnings: string[] = [];
  const pictures: PicData[] = [], seen = new Set<number>();
  const pictureMeta: PkgPic[] = [];
  for (const raw of m.pictures) {
    if (!isObj(raw)) throw new Error("A picture in the manifest is damaged.");
    const id = Number(raw.id), file = String(raw.file ?? ""), sha = String(raw.sha256 ?? "");
    if (!Number.isInteger(id) || id < 1 || id > 1e9 || seen.has(id)) throw new Error("A picture in the manifest has a bad or repeated id.");
    if (!/^pictures\/\d+\.(png|jpg)$/.test(file) || !file.startsWith(`pictures/${id}.`)) throw new Error(`Picture ${id} has a bad file name.`);
    if (!/^[0-9a-f]{64}$/.test(sha)) throw new Error(`Picture ${id} has no checksum.`);
    seen.add(id);
    const e = byName.get(file);
    if (!e) throw new Error(`The package has no ${file}.`);
    if (e.size > MAX_PIC_BYTES) throw new Error(`Picture ${id} is too large.`);
    const bytes = await e.data();
    if ((await sha256Hex(bytes)) !== sha) throw new Error(`Picture ${id} is damaged: its checksum does not match.`);
    if (!picExt(bytes)) throw new Error(`Picture ${id} is not a PNG or JPEG.`);
    pictureMeta.push({ id, name: cleanName(raw.name) || "picture", sky: raw.sky === true, sha256: sha, file });
    pictures.push({ id, name: cleanName(raw.name) || "picture", sky: raw.sky === true, sha256: sha, bytes });
  }
  const manifest: Manifest = { format: PKG_FORMAT, version: PKG_VERSION, scope: m.scope as Scope, room: cleanName(m.room), exported: String(m.exported ?? ""), pictures: pictureMeta, prefabs: [] };

  const prefabs: PkgPrefab[] = [];
  for (const raw of m.prefabs) {
    const name = isObj(raw) ? String(raw.name ?? "") : "", file = isObj(raw) ? String(raw.file ?? "") : "";
    if (!name || prefabSlug(name) !== name || file !== `prefabs/${name}.json` || !byName.has(file) || (byName.get(file)?.size ?? 0) > MAX_DOC_BYTES) { warnings.push("A prefab in the package is damaged and was left out."); continue; }
    try { prefabs.push({ name, doc: cleanDoc(JSON.parse(await read(file, MAX_DOC_BYTES))) }); manifest.prefabs.push({ name, file }); }
    catch { warnings.push(`Prefab “${name}” is damaged and was left out.`); }
  }
  const missing = [...collectPictureIds(room)].filter((id) => !seen.has(id)).length;
  if (missing) warnings.push(`${missing} picture reference${missing === 1 ? "" : "s"} point at pictures the package does not have; ${missing === 1 ? "it falls" : "they fall"} back to the plain patterns.`);
  return { manifest, room, pictures, prefabs, warnings };
}
