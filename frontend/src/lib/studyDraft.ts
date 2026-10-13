// Unsaved edits to a study, kept in localStorage so closing the tab (or a
// crash, or a dead battery) doesn't lose a half-written paper.
// Everything here swallows storage errors: private mode and full quotas
// throw, and losing the safety net must never break editing itself.

export interface StudyDraft {
  title: string;
  body: string;
  /** The saved body this draft was started from - lets us tell if the saved version moved on meanwhile. */
  base: string;
  savedAt: number;
}

const keyFor = (slug: string) => `exomusica_study_draft:${slug}`;

export function loadDraft(slug: string): StudyDraft | null {
  try {
    const raw = localStorage.getItem(keyFor(slug));
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d?.title !== "string" || typeof d?.body !== "string") return null;
    return { title: d.title, body: d.body, base: typeof d.base === "string" ? d.base : "", savedAt: Number(d.savedAt) || 0 };
  } catch {
    return null;
  }
}

export function saveDraft(slug: string, draft: StudyDraft): void {
  try {
    localStorage.setItem(keyFor(slug), JSON.stringify(draft));
  } catch {
    // out of space / storage disabled - editing carries on without the safety net
  }
}

export function clearDraft(slug: string): void {
  try {
    localStorage.removeItem(keyFor(slug));
  } catch {
    // nothing to do
  }
}

export function differsFromSaved(draft: { title: string; body: string }, saved: { title: string; body: string }): boolean {
  return draft.title !== saved.title || draft.body !== saved.body;
}

/** Every unsaved draft on this device, newest first (for the chart's "continue" list). */
export function listDrafts(): { slug: string; title: string; savedAt: number }[] {
  const out: { slug: string; title: string; savedAt: number }[] = [];
  try {
    const pre = "exomusica_study_draft:";
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(pre)) continue;
      const d = loadDraft(k.slice(pre.length));
      if (d) out.push({ slug: k.slice(pre.length), title: d.title.trim() || "Untitled", savedAt: d.savedAt });
    }
  } catch { /* nothing to list */ }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}
