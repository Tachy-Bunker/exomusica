/** One post office: PM conversations and letters merged by person. Pure so it tests without a DOM. */
export interface PmConv { partner: string; lastMessage: string; sentAt: number; unread: boolean }
export interface ThreadMessage { id: number; fromMe: boolean; contentRaw: string; sentAt: number; attachments: { id: number; filename: string; url: string; sizeBytes: number }[] }
export interface LetterBox { got: { id: number; from: string; at: string; opened: boolean }[]; sent: { id: number; to: string; state: string; deliverAt: string }[] }

export interface Row { partner: string; preview: string; at: number; unread: boolean; letters: number; unreadLetters: number }
export type Item =
  | { kind: "msg"; key: string; at: number; m: ThreadMessage }
  | { kind: "letter"; key: string; at: number; id: number; mine: boolean; opened: boolean; state: string; waiting: boolean };

const sec = (iso: string): number => Math.floor(new Date(iso).getTime() / 1000);
const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** Newest first; a person with only letters still gets a row. Unread (message or letter) rides on the row. */
export function mergeInbox(convs: PmConv[], box: LetterBox | null): Row[] {
  const rows = new Map<string, Row>();
  for (const c of convs) rows.set(c.partner.toLowerCase(), { partner: c.partner, preview: c.lastMessage, at: c.sentAt, unread: c.unread, letters: 0, unreadLetters: 0 });
  const touch = (name: string, at: number, preview: string, unreadLetter: boolean) => {
    if (!name) return;
    const k = name.toLowerCase(); let r = rows.get(k);
    if (!r) { r = { partner: name, preview, at, unread: false, letters: 0, unreadLetters: 0 }; rows.set(k, r); }
    r.letters++; if (unreadLetter) { r.unreadLetters++; r.unread = true; }
    if (at > r.at) { r.at = at; r.preview = preview; }
  };
  for (const l of box?.got ?? []) touch(l.from, sec(l.at), "✉ a letter", !l.opened);
  for (const l of box?.sent ?? []) touch(l.to, sec(l.deliverAt), l.state === "in the post" ? "✉ in the post" : "✉ you sent a letter", false);
  return [...rows.values()].sort((a, b) => b.at - a.at);
}

/** A conversation as one timeline: texts and letters in the order they happened. A letter still in the post sits at the end, marked as waiting. */
export function mergeThread(partner: string, msgs: ThreadMessage[], box: LetterBox | null): Item[] {
  const out: Item[] = msgs.map((m) => ({ kind: "msg", key: `m${m.id}`, at: m.sentAt, m }));
  for (const l of box?.got ?? []) if (same(l.from, partner)) out.push({ kind: "letter", key: `l${l.id}`, at: sec(l.at), id: l.id, mine: false, opened: l.opened, state: l.opened ? "opened" : "arrived", waiting: false });
  for (const l of box?.sent ?? []) if (same(l.to, partner)) out.push({ kind: "letter", key: `l${l.id}`, at: sec(l.deliverAt), id: l.id, mine: true, opened: true, state: l.state, waiting: l.state === "in the post" });
  return out.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
}

export const unreadTotal = (rows: Row[]): number => rows.reduce((n, r) => n + (r.unread ? 1 : 0), 0);
