import { create } from "zustand";
import { getCurrentSfxVolume } from "./volumeMixerStore";
import { playOneShotSfx } from "./oneShotSfx";
import { useClassicMode } from "./classicMode";
import { JINGLE_EVENTS, type JingleEvent } from "./jingleBus";
import { api, getToken } from "./api";
import { playMotif } from "./motif";
// Pickup sounds are the admin's own recordings. A listener hears each one once, only if they switched them on, never in classic mode.
const ON = "exomusica_jingles", DONE = "exomusica_jingles_done";
const rd = (k: string): string => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
const wr = (k: string, v: string) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* storage blocked */ } };
const readDone = (): string[] => { try { const v = JSON.parse(rd(DONE) || "[]"); return Array.isArray(v) ? v.filter((x) => (JINGLE_EVENTS as string[]).includes(x)) : []; } catch { return []; } };

export function shouldPlay(a: { classic: boolean; on: boolean; done: readonly string[]; event: string; url: string | undefined }): boolean {
  return !a.classic && a.on && !!a.url && !a.done.includes(a.event);
}
/** Union of what this device and the account have heard, in a stable order. */
export function mergeDone(a: readonly string[], b: readonly string[]): string[] {
  return (JINGLE_EVENTS as string[]).filter((e) => a.includes(e) || b.includes(e));
}
/** Logged in: pull what the account has already heard (so another device's jingles stay quiet) and push what only this device knows. */
export async function syncJingles(): Promise<void> {
  if (!getToken()) return;
  try {
    const r = await api<{ done?: string[] }>("/api/account/jingles-done");
    const remote = Array.isArray(r?.done) ? r.done : [], local = readDone();
    const merged = mergeDone(local, remote);
    wr(DONE, JSON.stringify(merged));
    for (const e of merged) if (!remote.includes(e)) await api("/api/account/jingles-done", { method: "POST", body: JSON.stringify({ event: e }) });
  } catch { /* offline: this device's own list still works */ }
}
interface S { on: boolean; urls: Partial<Record<JingleEvent, string>>; setOn: (v: boolean) => void; setUrls: (u: unknown) => void; forget: () => void }
export const useJingles = create<S>((set) => ({
  on: rd(ON) === "1", urls: {},
  setOn: (v) => { wr(ON, v ? "1" : ""); set({ on: v }); },
  setUrls: (u) => { const o: Partial<Record<JingleEvent, string>> = {}; if (u && typeof u === "object") for (const e of JINGLE_EVENTS) { const v = (u as Record<string, unknown>)[e]; if (typeof v === "string" && v) o[e] = v; } set({ urls: o }); },
  forget: () => { wr(DONE, ""); if (getToken()) void api("/api/account/jingles-done", { method: "DELETE" }).catch(() => undefined); },
}));
/** The collective jingle's notes (null while locked or not yet drawn). Asked for only when a jingle would actually play; a miss is retried after a minute. */
export interface CollectiveSeed { notes: number[]; credits: { title: string; by: string }[] }
let seedAt = 0, seedP: Promise<CollectiveSeed | null> | null = null;
export function loadCollective(): Promise<CollectiveSeed | null> {
  if (seedP && Date.now() - seedAt < 60_000) return seedP;
  seedAt = Date.now();
  seedP = api<{ ready?: boolean; notes?: number[]; credits?: { title: string; by: string }[] }>("/api/collective-jingle")
    .then((r) => (r?.ready && Array.isArray(r.notes) && r.notes.length >= 4 ? { notes: r.notes, credits: Array.isArray(r.credits) ? r.credits : [] } : null))
    .catch(() => null);
  return seedP;
}
let installed = false;
export function installJingles(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("exo:jingle", (e) => {
    const event = (e as CustomEvent<string>).detail;
    const { on, urls } = useJingles.getState(), done = readDone();
    const url = (urls as Record<string, string | undefined>)[event];
    if (!url) { // no recording from the admin for this moment: once the community reaches Collective jingle, it gets the motif instead
      if (useClassicMode.getState().classic || !on || done.includes(event)) return;
      void loadCollective().then((seed) => {
        if (!seed || readDone().includes(event)) return;
        wr(DONE, JSON.stringify([...readDone(), event]));
        if (getToken()) void api("/api/account/jingles-done", { method: "POST", body: JSON.stringify({ event }) }).catch(() => undefined);
        playMotif(seed.notes, getCurrentSfxVolume());
      });
      return;
    }
    if (!shouldPlay({ classic: useClassicMode.getState().classic, on, done, event, url })) return;
    wr(DONE, JSON.stringify([...done, event]));
    if (getToken()) void api("/api/account/jingles-done", { method: "POST", body: JSON.stringify({ event }) }).catch(() => undefined);
    void playOneShotSfx(url!, getCurrentSfxVolume());
  });
}
