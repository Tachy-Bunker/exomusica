import { create } from "zustand";
import { useEffect } from "react";
import { api } from "./api";
import { getSeen } from "./chatStrip";
import { useChatDockStore } from "./chatDockStore";
import { useAuth } from "./auth";
import { fromRemote } from "./rooms";

export interface Pulse { last: number | null; recent: number; mentions: number; line: { by: string; text: string } | null }
interface PulseState { by: Record<string, Pulse>; set: (p: Record<string, Pulse>) => void }
export const usePulseStore = create<PulseState>((set) => ({ by: {}, set: (p) => set((s) => ({ by: { ...s.by, ...p } })) }));

/** Which rooms the lamps need: everything pinned, the recents, and the one you are in. */
export function dialSlugs(): string[] {
  const s = useChatDockStore.getState();
  return [...new Set([s.openChannelSlug, ...s.presets.map((p) => p?.slug), ...s.recents.map((r) => r.slug)].filter((x): x is string => !!x))].slice(0, 12);
}

/** One request a minute while the tab is visible, nothing otherwise. Also when the switcher opens (fresh last lines). */
export function useDialPulse(enabled: boolean): void {
  const { user } = useAuth();
  const open = useChatDockStore((s) => s.switcherOpen);
  const key = useChatDockStore((s) => dialSlugs().join(","));
  useEffect(() => {
    if (!enabled || !user || !key) return;
    let dead = false;
    const ask = () => {
      if (document.visibilityState !== "visible") return;
      const slugs = key.split(",");
      const seen = slugs.map((sl) => { const v = getSeen(sl); return v ? `${sl}:${v}` : ""; }).filter(Boolean).join(",");
      void api<Record<string, Pulse>>(`/api/dial/pulse?slugs=${encodeURIComponent(key)}&seen=${encodeURIComponent(seen)}`).then((p) => { if (!dead && p && typeof p === "object") usePulseStore.getState().set(p); }).catch(() => {});
    };
    ask();
    const t = window.setInterval(ask, 60_000);
    document.addEventListener("visibilitychange", ask);
    return () => { dead = true; clearInterval(t); document.removeEventListener("visibilitychange", ask); };
  }, [enabled, user, key, open]);
}

/** The dial follows the member: on login take the server's copy (or push this device's if the server has none), then push changes, debounced. */
export function useDialSync(): void {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    let dead = false, timer = 0, ready = false;
    const push = () => {
      const { presets, scenes } = useChatDockStore.getState();
      void api("/api/account/dial", { method: "PUT", body: JSON.stringify({ presets, scenes }) }).catch(() => {});
    };
    const unsub = useChatDockStore.subscribe((s, prev) => {
      if (!ready || (s.presets === prev.presets && s.scenes === prev.scenes)) return;
      window.clearTimeout(timer); timer = window.setTimeout(push, 1200);
    });
    void api<{ dial: unknown }>("/api/account/dial").then((r) => {
      if (dead) return;
      const remote = fromRemote(r?.dial);
      if (remote) useChatDockStore.getState().hydrateDial(remote);
      else if (useChatDockStore.getState().presets.some(Boolean) || useChatDockStore.getState().scenes.length) push();
    }).catch(() => {}).finally(() => { ready = true; });
    return () => { dead = true; unsub(); window.clearTimeout(timer); };
  }, [user]);
}
