/** Structured chat messages (CQ, signal report, poll, A/B, clip). Pure: the server rebuilds `data` from known fields and writes the plain-text fallback itself,
 *  so Discord, search, the archive and exports all keep reading a normal message. */

export const KINDS = ["cq", "report", "poll", "ab", "clip"] as const;
export type Kind = (typeof KINDS)[number];
export const WANTS = ["listeners", "feedback", "collab", "sample", "answers"] as const;

const clip = (v: unknown, max: number): string => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const int = (v: unknown, lo: number, hi: number): number | null => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null; };
/** Media may come from this site (/uploads/...) or the open web over https. */
export const isMediaUrl = (v: unknown): v is string => typeof v === "string" && v.length <= 500 && (/^https:\/\/[^\s]+$/.test(v) || /^\/uploads\/[^\s]+$/.test(v));
export const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export type Cleaned = { ok: true; kind: Kind; data: Record<string, unknown>; text: string } | { ok: false; error: string };

export function cleanKind(kind: unknown, raw: unknown): Cleaned {
  if (!(KINDS as readonly unknown[]).includes(kind)) return { ok: false, error: "unknown message type" };
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  switch (kind as Kind) {
    case "cq": {
      const topic = clip(d.topic, 120);
      if (!topic) return { ok: false, error: "CQ needs a topic: what are you calling about?" };
      const wants = [...new Set((Array.isArray(d.wants) ? d.wants : []).map(String).filter((w) => (WANTS as readonly string[]).includes(w)))].slice(0, 3);
      return { ok: true, kind: "cq", data: { topic, wants }, text: `[CQ] ${topic}${wants.length ? ` (looking for: ${wants.join(", ")})` : ""}` };
    }
    case "report": {
      const target = clip(d.target, 160), r = int(d.r, 1, 5), s = int(d.s, 1, 9), t = int(d.t, 1, 9);
      if (!target) return { ok: false, error: "A report is about something: give a link or a name." };
      if (r === null || s === null || t === null) return { ok: false, error: "A report needs R (1-5), S (1-9) and T (1-9)." };
      const note = clip(d.note, 200);
      return { ok: true, kind: "report", data: { target, r, s, t, note }, text: `[Report] ${target}: R${r} S${s} T${t}${note ? ` - ${note}` : ""}` };
    }
    case "poll": {
      const q = clip(d.q, 160);
      const options = (Array.isArray(d.options) ? d.options : []).map((o) => clip(o, 60)).filter(Boolean).slice(0, 6);
      if (!q) return { ok: false, error: "A poll needs a question." };
      if (options.length < 2) return { ok: false, error: "A poll needs at least two options." };
      return { ok: true, kind: "poll", data: { q, options }, text: `[Poll] ${q}\n${options.map((o, i) => `${i + 1}) ${o}`).join("\n")}` };
    }
    case "ab": {
      const q = clip(d.q, 160);
      if (!q) return { ok: false, error: "An A/B needs the question, e.g. Which has the warmer low end?" };
      if (!isMediaUrl(d.a) || !isMediaUrl(d.b)) return { ok: false, error: "An A/B needs two audio links (https or an uploaded file)." };
      return { ok: true, kind: "ab", data: { q, a: d.a, b: d.b }, text: `[A/B] ${q}\nA: ${d.a}\nB: ${d.b}` };
    }
    case "clip": {
      if (!isMediaUrl(d.url)) return { ok: false, error: "A clip needs an audio link (https or an uploaded file)." };
      const from = Number(d.from), to = Number(d.to);
      if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from) return { ok: false, error: "A clip needs a start and a later end." };
      if (to - from > 120) return { ok: false, error: "A clip is at most two minutes." };
      const label = clip(d.label, 80);
      return { ok: true, kind: "clip", data: { url: d.url, from: Math.floor(from), to: Math.ceil(to), label }, text: `[Clip] ${label ? label + " " : ""}${mmss(from)}-${mmss(to)} ${d.url}` };
    }
  }
}

/** Counts per option from the stored votes; options nobody picked are zero. */
export function pollTally(optionCount: number, votes: Iterable<number>): { counts: number[]; total: number } {
  const counts = Array<number>(optionCount).fill(0);
  let total = 0;
  for (const v of votes) if (Number.isInteger(v) && v >= 0 && v < optionCount) { counts[v]++; total++; }
  return { counts, total };
}

/** How many options a poll-like message has (an A/B is always two). */
export const optionCountOf = (kind: string, data: unknown): number => kind === "ab" ? 2 : kind === "poll" && data && typeof data === "object" && Array.isArray((data as { options?: unknown }).options) ? (data as { options: unknown[] }).options.length : 0;
