export const MAX_WANTED = 12;
export interface WantedRow { id: number; title: string; detail: string; claimedAlbumId: number | null; claimedAlbum?: { submissionStatus: string | null } | null }

/** A claim only counts while its submission is alive: a rejected one frees the slot again. */
export function slotState(w: WantedRow): "open" | "claimed" {
  if (!w.claimedAlbumId) return "open";
  return w.claimedAlbum?.submissionStatus === "REJECTED" ? "open" : "claimed";
}

export function cleanWanted(b: { title?: unknown; detail?: unknown }): { title: string; detail: string } | null {
  const title = typeof b.title === "string" ? b.title.trim().slice(0, 80) : "";
  if (!title) return null;
  const detail = typeof b.detail === "string" ? b.detail.trim().slice(0, 200) : "";
  return { title, detail };
}
