import { create } from "zustand";
import { fromHsl, toHsl } from "./hsl";
// Season shift: every 90 days of the site's age is an "era". Once the community unlocks it, the four accent colours turn by a fixed step per era (saturation is kept and lightness is adjusted so each colour is as bright as before, so contrast stays as it was) and the optional hum changes its root note. Chosen skins win over the era.
export const ERA_DAYS = 90;
export const ERAS = ["Ember", "Lichen", "Moss", "Tide", "Dusk", "Orchid"] as const;
export const HUE_STEP = 52;
export const eraOf = (days: number): number => Math.max(0, Math.floor(days / ERA_DAYS)) % ERAS.length;

const BASE = { accentForum: "#e2703f", accentForumDim: "#7a3a1f", accentAudio: "#4fa8e0", accentAudioDim: "#1f4566" };
const VARS = { accentForum: "--accent-forum", accentForumDim: "--accent-forum-dim", accentAudio: "--accent-audio", accentAudioDim: "--accent-audio-dim" } as const;

export const rotateHue = (hex: string, deg: number): string => { const [h, s, l] = toHsl(hex); return fromHsl((h + deg + 360) % 360, s, l); };

const lum = (hex: string): number => { const n = parseInt(hex.slice(1), 16); const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255); };
/** Turns the hue and then moves the lightness until the colour is exactly as bright to the eye as the original, so every era keeps the contrast the palette was checked for. */
export function rotateKeepBrightness(hex: string, deg: number): string {
  if (deg % 360 === 0) return hex;
  const [h0, s] = toHsl(hex), target = lum(hex), h = (h0 + deg + 360) % 360;
  let lo = 0, hi = 1;
  for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (lum(fromHsl(h, s, mid)) < target) lo = mid; else hi = mid; }
  return fromHsl(h, s, (lo + hi) / 2);
}

export function eraAccents(era: number): typeof BASE {
  const d = era * HUE_STEP;
  return { accentForum: rotateKeepBrightness(BASE.accentForum, d), accentForumDim: rotateKeepBrightness(BASE.accentForumDim, d), accentAudio: rotateKeepBrightness(BASE.accentAudio, d), accentAudioDim: rotateKeepBrightness(BASE.accentAudioDim, d) };
}

interface S { era: number | null; days: number; unlocked: boolean; hum: boolean; set: (p: { era: number | null; days: number; unlocked: boolean }) => void; setHum: (v: boolean) => void }
const HUM_KEY = "exomusica_hum";
const readHum = (): boolean => { try { return localStorage.getItem(HUM_KEY) === "1"; } catch { return false; } };
export const useEra = create<S>((set) => ({
  era: null, days: 0, unlocked: false, hum: readHum(),
  set: (p) => set(p),
  setHum: (v) => { try { if (v) localStorage.setItem(HUM_KEY, "1"); else localStorage.removeItem(HUM_KEY); } catch { /* storage blocked */ } set({ hum: v }); },
}));

/** Puts the era's accents on the page, or takes them off (no era yet, or a skin is chosen). */
export function applyEra(era: number | null, skinned: boolean, root: HTMLElement = document.documentElement): void {
  if (era === null || skinned || era === 0) {
    if (!skinned) for (const v of Object.values(VARS)) root.style.removeProperty(v);
    delete root.dataset.era;
    return;
  }
  const a = eraAccents(era);
  for (const [k, v] of Object.entries(VARS)) root.style.setProperty(v, a[k as keyof typeof VARS]);
  root.dataset.era = ERAS[era].toLowerCase();
}
