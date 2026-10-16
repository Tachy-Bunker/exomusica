import { useEffect } from "react";
import { api, isSignedIn } from "./api";
import { useAudioStore } from "./audioStore";

/** A playing boss track reports one minute of listening per beat. The server takes at most one per 50 seconds. */
const BEAT_MS = 60_000;
const BOSS_TTL = 120_000;
let boss: { at: number; trackId: number | null } | null = null;

/** The track the month's boss is made of, or null while the challenge is closed or no track is set. Cached two minutes. */
async function bossTrackId(): Promise<number | null> {
  if (boss && Date.now() - boss.at < BOSS_TTL) return boss.trackId;
  try {
    const s = await api<{ open: boolean; boss: { trackId: number | null } | null }>("/api/monthly");
    boss = { at: Date.now(), trackId: s.open ? s.boss?.trackId ?? null : null };
  } catch {
    boss = { at: Date.now(), trackId: null };
  }
  return boss.trackId;
}

/** Sends a minute of listening while a signed-in member plays the month's boss track. Nothing is sent for any other track. */
export function useMonthlyListening(): void {
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!isSignedIn()) return;
      const st = useAudioStore.getState();
      const t = st.currentTrack;
      if (!st.isPlaying || !t || t.source !== "official") return;
      void bossTrackId().then((id) => {
        const now = useAudioStore.getState();
        const cur = now.currentTrack;
        if (id === null || !now.isPlaying || !cur || cur.id !== id || cur.source !== "official") return;
        void api("/api/monthly/listen", { method: "POST", body: JSON.stringify({ trackId: id }) }).catch(() => undefined);
      });
    }, BEAT_MS);
    return () => window.clearInterval(timer);
  }, []);
}

/** A room boss beaten. The server counts one run per member per day toward the month's bar. Silent when signed out. */
export function recordMonthlyRun(): void {
  if (!isSignedIn()) return;
  void api("/api/monthly/run", { method: "POST" }).catch(() => undefined);
}
