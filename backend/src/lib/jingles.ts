// Pickup sounds: short clips the admin uploads, one per moment worth marking. This file only decides which moments exist and shapes the stored map.
export const JINGLE_EVENTS = ["firstScan", "firstListen", "firstReply", "sectionDone"] as const;
export type JingleEvent = (typeof JINGLE_EVENTS)[number];
export const isJingleEvent = (v: string): v is JingleEvent => (JINGLE_EVENTS as readonly string[]).includes(v);

/** The stored map with one event set (url) or cleared (null). Unknown keys and non-string values in the old map are dropped; empty -> null so the column stays clean. */
export function withJingle(current: unknown, event: JingleEvent, url: string | null): Record<string, string> | null {
  const out: Record<string, string> = {};
  if (current && typeof current === "object" && !Array.isArray(current)) for (const [k, v] of Object.entries(current)) if (isJingleEvent(k) && typeof v === "string" && v) out[k] = v;
  if (url) out[event] = url; else delete out[event];
  return Object.keys(out).length ? out : null;
}
