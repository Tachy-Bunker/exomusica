// Counting the hops between things, anonymously, so the margins can show the roads people actually take.
// Only the pair (from, to) is ever sent, batched, with no account or device identifier. Browsers that ask not to be tracked send nothing.

/** The hop from the last thing looked at to this one, if it was recent and different. */
export function hop(prev: { key: string; at: number } | null, next: string, now: number, windowMs = 5 * 60_000): [string, string] | null {
  if (!prev || prev.key === next || now - prev.at > windowMs) return null;
  return [prev.key, next];
}

let last: { key: string; at: number } | null = null;
const queue: [string, string][] = [];
let timer: number | undefined;

const optedOut = (): boolean => typeof navigator !== "undefined" && (navigator.doNotTrack === "1" || (navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl === true);

export function flushTrace(): void {
  window.clearTimeout(timer);
  timer = undefined;
  if (!queue.length) return;
  const body = JSON.stringify({ edges: queue.splice(0, 10) });
  try {
    if (!navigator.sendBeacon?.("/api/atlas/trace", new Blob([body], { type: "application/json" }))) void fetch("/api/atlas/trace", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch { /* counting is best-effort */ }
}

let listening = false;
export function noteFocus(key: string | null): void {
  if (!key) return;
  if (!listening && typeof window !== "undefined") { listening = true; window.addEventListener("pagehide", flushTrace); document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushTrace(); }); }
  const now = Date.now();
  const edge = optedOut() ? null : hop(last, key, now);
  last = { key, at: now };
  if (!edge) return;
  queue.push(edge);
  if (queue.length >= 5) flushTrace();
  else timer ??= window.setTimeout(flushTrace, 20_000);
}
