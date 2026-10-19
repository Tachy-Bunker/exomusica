// Room packages, network side: export the saved version of a room, and import a package onto a room.
// Same endpoints the editor uses. Import order: pictures, then prefabs, then the room last, so a refusal before the room leaves the room as it was.
import { api } from "./api";
import { cleanDoc, type RoomDoc } from "./roomDoc";
import { prefabKey } from "./roomPrefab";
import { buildPackage, collectPictureIds, exportName, MAX_PREFABS, planPictures, remapDoc, toBase64, type Package, type PicData, type PkgPrefab, type Scope } from "./roomPackage";

export const LIB_MAX = 300;
type Lib = { id: number; name: string; sky?: boolean };
const msg = (e: unknown): string => (e instanceof Error ? e.message : "failed");

/** The saved version of `slug` as a package. Dangling picture references are dropped to the plain patterns, the same way an import does. */
export async function exportRoom(slug: string, scope: Scope, withPrefabs: boolean, status: (s: string) => void): Promise<{ blob: Blob; file: string; notes: string[] }> {
  const notes: string[] = [];
  status("Reading the room…");
  const r = await api<{ version: number; doc: unknown }>(`/api/room-doc/${slug}`, { cache: "no-store" });
  if (!(r.version > 0)) throw new Error("This room has nothing saved yet, so there is nothing to export.");
  const doc = cleanDoc(r.doc);
  const ids = [...collectPictureIds(doc)];
  const lib = await api<Lib[]>("/api/admin/room-textures");
  const meta = new Map(lib.map((l) => [l.id, l]));
  const pics: PicData[] = [], keep = new Map<number, number>();
  let n = 0;
  for (const id of ids) {
    const m = meta.get(id);
    if (!m) continue;
    status(`Picture ${++n} of ${ids.length}…`);
    const res = await fetch(`/api/room-textures/${id}`);
    if (!res.ok) throw new Error(`Could not read picture ${id}.`);
    pics.push({ id, name: m.name.replace(/^sky:/, ""), sky: m.sky === true || m.name.startsWith("sky:"), sha256: "", bytes: new Uint8Array(await res.arrayBuffer()) });
    keep.set(id, id);
  }
  const clean = remapDoc(doc, keep);
  if (clean.missing) notes.push(`${clean.missing} picture reference${clean.missing === 1 ? "" : "s"} point at pictures that are gone; ${clean.missing === 1 ? "it falls" : "they fall"} back to the plain patterns.`);
  const prefabs: PkgPrefab[] = [];
  if (withPrefabs) {
    status("Reading the prefab library…");
    const list = await api<{ slug: string }[]>("/api/admin/room-prefabs");
    for (const p of list.slice(0, MAX_PREFABS)) {
      try { const pr = await api<{ doc: unknown }>(`/api/room-doc/${prefabKey(p.slug)}`, { cache: "no-store" }); prefabs.push({ name: p.slug, doc: cleanDoc(pr.doc) }); }
      catch { notes.push(`Prefab “${p.slug}” could not be read and was left out.`); }
    }
  }
  status("Packing…");
  const data = await buildPackage({ room: slug, scope, doc: clean.doc, pictures: pics, prefabs });
  return { blob: new Blob([data as BlobPart], { type: "application/zip" }), file: exportName(slug), notes };
}

/** What importing `pkg` would do to the library, for the preview: how many pictures are new and how many the library has already. */
export async function previewImport(pkg: Package): Promise<{ reused: number; upload: number; prefabsNew: number }> {
  const digests = await api<{ id: number; sha256: string }[]>("/api/admin/room-textures/digests");
  const plan = planPictures(pkg.pictures, digests);
  let prefabsNew = 0;
  for (const f of pkg.prefabs) {
    const cur = await api<{ version: number }>(`/api/room-doc/${prefabKey(f.name)}`, { cache: "no-store" }).catch(() => ({ version: 0 }));
    if (!(cur.version > 0)) prefabsNew++;
  }
  return { reused: plan.reuse.size + plan.alias.size, upload: plan.upload.length, prefabsNew };
}

/** Puts `pkg` on the room `slug`. `baseVersion` is the version the editor loaded: if someone saved since, the server refuses and nothing changes.
 *  The room's previous version stays in its history. */
export async function importRoom(pkg: Package, slug: string, baseVersion: number, status: (s: string) => void): Promise<{ version: number; doc: RoomDoc; notes: string[] }> {
  const notes = [...pkg.warnings];
  status("Checking the picture library…");
  const lib = await api<Lib[]>("/api/admin/room-textures");
  const digests = await api<{ id: number; sha256: string }[]>("/api/admin/room-textures/digests");
  const plan = planPictures(pkg.pictures, digests);
  if (lib.length + plan.upload.length > LIB_MAX) throw new Error(`The picture library has room for ${Math.max(0, LIB_MAX - lib.length)} more. This package needs ${plan.upload.length}. Delete some first.`);
  const map = new Map<number, number>(plan.reuse);
  let i = 0;
  for (const p of plan.upload) {
    status(`Uploading picture ${++i} of ${plan.upload.length}…`);
    try {
      const row = await api<{ id: number }>("/api/admin/room-textures", { method: "POST", body: JSON.stringify({ name: p.name, sky: p.sky, png: toBase64(p.bytes) }) });
      map.set(p.id, row.id);
    } catch (e) {
      throw new Error(`Picture “${p.name}” was refused: ${msg(e)}. The room is unchanged; the pictures uploaded before it are in the library.`);
    }
  }
  for (const [pid, first] of plan.alias) { const to = map.get(first); if (to !== undefined) map.set(pid, to); }

  const { doc, missing } = remapDoc(pkg.room, map);
  if (missing) notes.push(`${missing} picture reference${missing === 1 ? "" : "s"} had no picture in the package; ${missing === 1 ? "it falls" : "they fall"} back to the plain patterns.`);

  if (pkg.prefabs.length) status("Checking the prefab library…");
  let added = 0, kept = 0;
  for (const f of pkg.prefabs) {
    const cur = await api<{ version: number }>(`/api/room-doc/${prefabKey(f.name)}`, { cache: "no-store" }).catch(() => ({ version: 0 }));
    if (cur.version > 0) { kept++; continue; }
    try { await api(`/api/admin/room-doc/${prefabKey(f.name)}`, { method: "PUT", body: JSON.stringify({ doc: f.doc, baseVersion: 0 }) }); added++; }
    catch { notes.push(`Prefab “${f.name}” could not be saved.`); }
  }
  if (pkg.prefabs.length) notes.push(`Prefabs: ${added} added; ${kept} already in the library, kept as they are.`);

  status("Saving the room…");
  const r = await api<{ version: number; doc: RoomDoc }>(`/api/admin/room-doc/${slug}`, { method: "PUT", body: JSON.stringify({ doc, baseVersion }) });
  return { version: r.version, doc: r.doc, notes };
}
