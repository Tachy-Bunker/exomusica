// Backup file for discussion topics: plain JSON, authors by username, no files (attachments stay on the server).
// Pure helpers live here so they can be tested without a database.

export const BACKUP_FORMAT = "exomusica-topics";

export interface BackupMessage {
  id: number;
  author: string;
  at: string; // ISO
  replyTo: number | null; // another message's backup id
  text: string;
  edited: string | null;
  importedFrom: string | null;
}
export interface BackupTopic {
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  position: number;
  contentMarkdown: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
  messages: BackupMessage[];
}
export interface BackupFile { format: typeof BACKUP_FORMAT; version: 1; exportedAt: string; topics: BackupTopic[] }

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Accepts anything, returns only well-formed topics (or throws a readable error). Never trusts shapes. */
export function parseBackup(raw: unknown): BackupTopic[] {
  const f = raw as Partial<BackupFile> | null;
  if (!f || f.format !== BACKUP_FORMAT || !Array.isArray(f.topics)) throw new Error("Not an Exomusica topic backup");
  const out: BackupTopic[] = [];
  for (const t of f.topics as unknown[]) {
    const o = t as Record<string, unknown>;
    const slug = str(o?.slug)?.trim();
    const name = str(o?.name)?.trim();
    if (!slug || !name || !/^[a-z0-9][a-z0-9-]*$/i.test(slug)) continue;
    const messages: BackupMessage[] = [];
    for (const m of Array.isArray(o.messages) ? (o.messages as Record<string, unknown>[]) : []) {
      const author = str(m?.author)?.trim();
      const at = str(m?.at);
      const text = str(m?.text);
      if (!author || !at || text === null || Number.isNaN(Date.parse(at))) continue;
      messages.push({
        id: Number(m.id) || 0,
        author,
        at,
        replyTo: Number.isInteger(m.replyTo) ? (m.replyTo as number) : null,
        text,
        edited: str(m.edited),
        importedFrom: str(m.importedFrom),
      });
    }
    out.push({
      slug, name,
      description: str(o.description), category: str(o.category),
      position: Number.isFinite(Number(o.position)) ? Number(o.position) : 0,
      contentMarkdown: str(o.contentMarkdown), ogTitle: str(o.ogTitle), ogDescription: str(o.ogDescription), ogImageUrl: str(o.ogImageUrl),
      messages,
    });
  }
  return out;
}

/** The identity of a message for "already there?" checks when merging into an existing topic. */
export const messageKey = (authorId: number, at: Date | string, text: string): string => `${authorId}|${new Date(at).getTime()}|${text}`;
