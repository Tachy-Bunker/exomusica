import { focusOf } from "./atlas";
import { api } from "./api";
import type { Room } from "./rooms";

/** What was dropped on the dial: a `[Title](url)` link text from a Plate or the pocket. Only a topic or a branch is a room. */
export function parseDropped(text: string): { kind: "topic" | "branch"; id: string; title: string } | null {
  const m = /\[([^\]]*)\]\((\S+?)\)/.exec(text) ?? [null, "", text.trim()] as unknown as RegExpExecArray;
  let path: string; try { const u = new URL(m[2], "http://x"); path = u.pathname; } catch { return null; }
  const f = focusOf(path);
  return f && (f.type === "topic" || f.type === "branch") ? { kind: f.type, id: f.id, title: m[1] || f.id } : null;
}

interface BranchRow { slug: string; name: string; channel: { slug: string } | null }
/** The room behind a dropped thing, or null when there is no chat there. */
export async function roomFromDrop(text: string, branches: () => Promise<BranchRow[]> = () => api<BranchRow[]>("/api/branches")): Promise<Room | null> {
  const d = parseDropped(text); if (!d) return null;
  if (d.kind === "topic") return { slug: d.id, name: d.title };
  const b = (await branches().catch(() => [])).find((x) => x.slug.toLowerCase() === d.id);
  return b?.channel ? { slug: b.channel.slug, name: b.name, branchSlug: b.slug } : null;
}
