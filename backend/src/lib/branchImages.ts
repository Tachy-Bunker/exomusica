// The pictures a branch has: its own cover, its albums' covers and its albums' gallery images. Pure, so it is tested without a database.

export interface BranchPicture {
  url: string;
  kind: "branch-cover" | "album-cover" | "gallery";
  label: string;
  albumSlug: string | null; // the album a picture belongs to (a click goes there); null for the branch's own cover
}

export const MAX_BRANCH_PICTURES = 60;

export function collectBranchImages(
  branch: { name: string; coverArtUrl: string | null },
  albums: { slug: string; title: string; coverArtUrl: string | null; galleryImages: { url: string }[] }[],
): BranchPicture[] {
  const out: BranchPicture[] = [];
  const seen = new Set<string>();
  const add = (url: string | null | undefined, kind: BranchPicture["kind"], label: string, albumSlug: string | null) => {
    if (!url || seen.has(url) || out.length >= MAX_BRANCH_PICTURES) return;
    seen.add(url);
    out.push({ url, kind, label, albumSlug });
  };
  add(branch.coverArtUrl, "branch-cover", `${branch.name} cover`, null);
  for (const a of albums) {
    add(a.coverArtUrl, "album-cover", a.title, a.slug);
    for (const g of a.galleryImages) add(g.url, "gallery", a.title, a.slug);
  }
  return out;
}
