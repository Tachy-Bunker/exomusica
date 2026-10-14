// "Continue" pins on the Forum Map: where you last listened, where a reply is waiting, where you left an unsent draft.
// Everything lives in this browser (a few localStorage keys) except the unread notifications, which the server already keeps.

export type PinKind = "listen" | "reply" | "draft";
const DRAFT = "exomusica_cdraft_";
const LISTEN = "exomusica_pin_listen";

const get = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private window: pins just don't persist */ } };

export function saveDraft(channelSlug: string, text: string): void { set(DRAFT + channelSlug, text.trim() ? text.slice(0, 2000) : null); }
export function loadDraft(channelSlug: string): string { return get(DRAFT + channelSlug) ?? ""; }

/** Remember that a branch's music was the last thing played; the map pins it on that branch's chat. */
export function noteListened(branchSlug: string | null | undefined): void { if (branchSlug) set(LISTEN, branchSlug); }

/** Channel slug -> the pins that apply to it. `unread` are the member's unread notifications that point at a channel. */
export function pinsFor(unread: { channelSlug: string | null; eventKey: string }[]): Map<string, Set<PinKind>> {
  const out = new Map<string, Set<PinKind>>();
  const add = (slug: string, k: PinKind) => { const s = out.get(slug) ?? new Set<PinKind>(); s.add(k); out.set(slug, s); };
  try {
    for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key?.startsWith(DRAFT) && (get(key) ?? "").trim()) add(key.slice(DRAFT.length), "draft"); }
  } catch { /* ignore */ }
  const l = get(LISTEN); if (l) add(`branch-${l}`, "listen");
  for (const n of unread) if (n.channelSlug && n.eventKey !== "pm" && n.eventKey !== "welcome_buddy") add(n.channelSlug, "reply");
  return out;
}

export const PIN_GLYPH: Record<PinKind, string> = { reply: "●", draft: "✎", listen: "♪" };
export const PIN_LABEL: Record<PinKind, string> = { reply: "a reply is waiting", draft: "you left a draft here", listen: "you last listened here" };
