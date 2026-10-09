import { focusOf, type EntityType } from "./atlas";
import { chatLinkText } from "./chatInsert";

export interface Dragged { type: EntityType; id: string; title: string }

/** Which thing in the Atlas does this address stand for? Same-site only. Branch links go to Soundbay (`/soundbay?open=slug`), so that form counts too.
 *  Anything that is not a thing (your account, messages, admin pages, other sites) is nothing: those are private or not carriable. */
export function entityOfHref(href: string, origin: string): { type: EntityType; id: string } | null {
  let u: URL; try { u = new URL(href, origin); } catch { return null; }
  if (u.origin !== origin) return null;
  if (u.pathname === "/soundbay" && u.searchParams.get("open")) return { type: "branch", id: u.searchParams.get("open")!.toLowerCase() };
  return focusOf(u.pathname, u.search);
}

/** What was dropped: a `[Title](url)` text, a bare url, or an anchor's own url + text. */
export function entityFromDrop(text: string, origin: string): Dragged | null {
  const m = /\[([^\]]*)\]\((\S+?)\)/.exec(text);
  const href = m ? m[2] : text.trim().split(/\s+/)[0];
  const e = href ? entityOfHref(href, origin) : null;
  return e ? { ...e, title: (m?.[1] || "").trim() || e.id } : null;
}

/** The text a dragged link carries so every drop target (pocket, chat, dial) understands it. */
export const dragText = (title: string, href: string): string => chatLinkText(title, href);
