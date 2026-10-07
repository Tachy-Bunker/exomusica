import { useCallback, useEffect, useRef } from "react";

// Refreshing live data only while someone is really there to see it, so a forgotten tab costs the server nothing.
export const POLL_MS = 15_000;
export const IDLE_MS = 10 * 60_000;

export interface PollContext {
  hidden: boolean; // the tab is in the background
  online: boolean;
  msSinceActivity: number; // since the visitor last moved, typed, scrolled or touched
  msSinceFetch: number;
}

/** Fetch now, or wait. Never while the tab is hidden, the browser is offline, or the visitor has been away for ten minutes; otherwise every 15 seconds. */
export function pollDecision(c: PollContext): "fetch" | "wait" {
  if (c.hidden || !c.online) return "wait";
  if (c.msSinceActivity > IDLE_MS) return "wait";
  return c.msSinceFetch >= POLL_MS ? "fetch" : "wait";
}

/**
 * Keeps `refresh` running on that schedule while `enabled` (the module is on screen and showing live data). Returns the function to
 * call for a manual refresh, which also restarts the 15 seconds. Coming back (the tab visible again, activity after being away, the
 * connection back, the module shown again) refreshes at once if the data has gone stale.
 */
export function useLivePoll(refresh: () => unknown, enabled: boolean): () => unknown {
  const times = useRef({ fetch: Date.now(), activity: Date.now() });
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const run = useCallback(() => { times.current.fetch = Date.now(); return refreshRef.current(); }, []);
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      const now = Date.now();
      if (pollDecision({ hidden: document.hidden, online: navigator.onLine !== false, msSinceActivity: now - times.current.activity, msSinceFetch: now - times.current.fetch }) === "fetch") run();
    };
    const onActivity = () => {
      const now = Date.now();
      const wasAway = now - times.current.activity > IDLE_MS;
      times.current.activity = now;
      if (wasAway) tick();
    };
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
    const id = window.setInterval(tick, 1000); // a light check once a second, so a refresh lands at 15 seconds rather than up to 18
    tick();
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("online", tick);
      window.clearInterval(id);
    };
  }, [enabled, run]);
  return run;
}
