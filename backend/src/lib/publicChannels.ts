// Which chats the public may see, and how to show a message of theirs in a feed. Pure, so it is tested without a database.

export interface ChannelLike {
  branchId: number | null;
  branch?: { visibility: "VISIBLE" | "HIDDEN" | "BABY_CRYSTALS" } | null;
}

/** Topics are public. A branch's chat is public unless the branch is hidden. */
export function isPublicChannel(ch: ChannelLike): boolean {
  if (ch.branchId === null) return true;
  return !!ch.branch && ch.branch.visibility !== "HIDDEN";
}

/** The same rule as a database filter. (Also re-checked in code with isPublicChannel, so a mistake in one can't leak.) */
export const PUBLIC_CHANNEL_FILTER = {
  OR: [{ branchId: null }, { branch: { visibility: { not: "HIDDEN" as const } } }],
};

/** A short plain-text line from a chat message: no markup, no links, no embedded media. Empty if nothing readable remains. */
export function plainExcerpt(raw: string, max = 110): string {
  let s = raw
    .replace(/@audio\([^)]*\)/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)(\{[^}]*\})?/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/:::\w*/g, " ")
    .replace(/[*_~`>#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > max) s = s.slice(0, max).replace(/\s+\S*$/, "") + "…";
  return s;
}

/** What to show for a message that has no readable text but does have files. */
export function attachmentOnlyLabel(filenames: string[]): string {
  if (filenames.length === 0) return "";
  if (filenames.every((f) => /^voice-note.*\.m4a$/i.test(f))) return "sent a voice note";
  if (filenames.every((f) => /\.(png|jpe?g|gif|webp|avif)$/i.test(f))) return filenames.length > 1 ? "shared pictures" : "shared a picture";
  if (filenames.every((f) => /\.(mp3|wav|m4a|ogg|flac|aac|opus)$/i.test(f))) return "shared audio";
  return "shared a file";
}
