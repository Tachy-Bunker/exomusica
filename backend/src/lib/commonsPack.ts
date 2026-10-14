// Commons pack (milestone m-commons): a monthly sample ZIP of tracks whose creators allow reuse. Pure parts, tested without a database.
export const PACK_MAX_FILES = 40;
export const PACK_MAX_BYTES = 200 * 1024 * 1024;
export const REUSE = ["CREDIT_REQUIRED", "FREE_REMIX"] as const;
export interface PackCandidate { id: number; sizeBytes: number; title: string; composer: string; permission: string; ext: string; owner: string }

export const monthKey = (d: Date): string => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

function fnv(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** A different, repeatable draw each month: the same month always gives the same pack, so a rebuilt file is the same pack. Stops at the file and size limits. */
export function pickPack(cands: PackCandidate[], month: string, maxFiles = PACK_MAX_FILES, maxBytes = PACK_MAX_BYTES): PackCandidate[] {
  const ordered = [...cands].sort((a, b) => fnv(`${month}:${a.id}`) - fnv(`${month}:${b.id}`) || a.id - b.id);
  const out: PackCandidate[] = []; let total = 0;
  for (const c of ordered) {
    if (out.length >= maxFiles) break;
    if (!(c.sizeBytes > 0) || total + c.sizeBytes > maxBytes) continue;
    out.push(c); total += c.sizeBytes;
  }
  return out;
}

const slug = (s: string): string => s.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "track";
export const entryName = (i: number, c: Pick<PackCandidate, "title" | "ext">): string => `${String(i + 1).padStart(2, "0")}-${slug(c.title)}.${/^[a-z0-9]{2,5}$/i.test(c.ext) ? c.ext.toLowerCase() : "bin"}`;

export function creditsText(picked: PackCandidate[], month: string): string {
  const lines = [`Exomusica Commons pack, ${month}`, "", "Every track here was shared by its creator for reuse.", "FREE_REMIX: use it freely. CREDIT_REQUIRED: use it and credit the creator as listed below.", ""];
  picked.forEach((c, i) => lines.push(`${entryName(i, c)}  |  "${c.title.replace(/[\r\n]+/g, " ")}" by ${(c.composer || c.owner).replace(/[\r\n]+/g, " ")}  |  ${c.permission}`));
  return lines.join("\n") + "\n";
}
