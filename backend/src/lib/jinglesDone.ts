export const JINGLE_EVENTS = ["firstScan", "firstListen", "firstReply", "sectionDone"] as const;

/** Only known events, no duplicates, in a stable order. */
export function cleanDone(x: unknown): string[] {
  const arr = Array.isArray(x) ? x : [];
  return JINGLE_EVENTS.filter((e) => arr.includes(e));
}

/** The list with `event` added; null if it is not a known event. */
export function addDone(done: string[], event: unknown): string[] | null {
  if (typeof event !== "string" || !(JINGLE_EVENTS as readonly string[]).includes(event)) return null;
  return cleanDone([...done, event]);
}
