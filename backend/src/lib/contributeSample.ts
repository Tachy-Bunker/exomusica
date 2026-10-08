// The sample a branch offers contributors: a track already on the site, or a file from a chat. Pure, so it is tested without a database.
import { isPublicChannel } from "./publicChannels.js";

export type Sample =
  | { kind: "track"; source: "official" | "community"; trackId: number; albumSlug: string; title: string; detail: string }
  | { kind: "attachment"; url: string; title: string; origin: { label: string; href: string } | null };

interface Src {
  sampleTrack: { id: number; title: string; fileUrl: string; album: { slug: string; title: string } } | null;
  sampleCommunityTrack: { id: number; title: string; externalUrl: string | null; attachment: { storagePath: string } | null; album: { slug: string; title: string } } | null;
  previewAttachment: {
    storagePath: string;
    filename: string;
    message: { id: number; dayKey: Date; channel: { slug: string; name: string; branchId: number | null; branch: { visibility: "VISIBLE" | "HIDDEN" | "BABY_CRYSTALS" } | null } } | null;
  } | null;
}

const titleOf = (filename: string) => filename.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/_+/g, " ").trim() || "Sample";

/** The chat message a file came from, as a link, but only when that chat is public (a hidden branch's chat is never named). */
export function originOf(m: NonNullable<Src["previewAttachment"]>["message"], today = new Date()): { label: string; href: string } | null {
  if (!m || !isPublicChannel(m.channel)) return null;
  const day = m.dayKey.toISOString().slice(0, 10);
  const isToday = day === today.toISOString().slice(0, 10);
  return { label: m.channel.name, href: `/topic/${m.channel.slug}${isToday ? "" : `?day=${day}`}#m-${m.id}` };
}

/** One sample per branch; a track chosen on the site wins over a chat file. */
export function sampleOf(b: Src): Sample | null {
  if (b.sampleTrack) return { kind: "track", source: "official", trackId: b.sampleTrack.id, albumSlug: b.sampleTrack.album.slug, title: b.sampleTrack.title, detail: b.sampleTrack.album.title };
  if (b.sampleCommunityTrack) return { kind: "track", source: "community", trackId: b.sampleCommunityTrack.id, albumSlug: b.sampleCommunityTrack.album.slug, title: b.sampleCommunityTrack.title, detail: b.sampleCommunityTrack.album.title };
  if (b.previewAttachment) return { kind: "attachment", url: b.previewAttachment.storagePath, title: titleOf(b.previewAttachment.filename), origin: originOf(b.previewAttachment.message) };
  return null;
}

/** A URL for the old `previewUrl` field (filters and sorting only need to know there is something to hear). */
export function sampleUrl(b: Src): string | null {
  return b.sampleTrack?.fileUrl ?? b.sampleCommunityTrack?.attachment?.storagePath ?? b.sampleCommunityTrack?.externalUrl ?? b.previewAttachment?.storagePath ?? null;
}
