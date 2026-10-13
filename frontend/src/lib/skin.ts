import { create } from "zustand";
// Two optional palettes (Chozo: warm gold, calm. Phazon: cold teal, harsh) and an optional HUD frame. Palettes are plain data applied as CSS variables, so a test can check their contrast and nothing is repeated in the stylesheet.
export type SkinId = "" | "chozo" | "phazon";
export interface Palette { bg: string; bgElevated: string; bgInset: string; text: string; textDim: string; border: string; accentForum: string; accentForumDim: string; accentAudio: string; accentAudioDim: string; accentDanger: string; radius?: string }
export const SKINS: Record<Exclude<SkinId, "">, { label: string; blurb: string; palette: Palette }> = {
  chozo: { label: "Chozo", blurb: "Warm gold, organic, calm", palette: { bg: "#17120a", bgElevated: "#221a0e", bgInset: "#0f0b06", text: "#f6ecd6", textDim: "#c4b28a", border: "#4a3a1c", accentForum: "#e0a23a", accentForumDim: "#6b4a14", accentAudio: "#b8c76a", accentAudioDim: "#4a5220", accentDanger: "#e0674d" } },
  phazon: { label: "Phazon", blurb: "Cold teal, sharp, glitchy", palette: { bg: "#040b0d", bgElevated: "#0a181b", bgInset: "#020608", text: "#e4fbfa", textDim: "#84b8b4", border: "#124046", accentForum: "#19e0c8", accentForumDim: "#0d5a52", accentAudio: "#3fd0ff", accentAudioDim: "#0f4a63", accentDanger: "#ff4d7a", radius: "2px" } },
};
const VARS: Record<keyof Omit<Palette, "radius">, string> = { bg: "--bg", bgElevated: "--bg-elevated", bgInset: "--bg-inset", text: "--text", textDim: "--text-dim", border: "--border", accentForum: "--accent-forum", accentForumDim: "--accent-forum-dim", accentAudio: "--accent-audio", accentAudioDim: "--accent-audio-dim", accentDanger: "--accent-danger" };

/** WCAG contrast ratio of two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0); };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const SKIN_KEY = "exomusica_skin", HUD_KEY = "exomusica_hud";
const get = (k: string): string => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
const put = (k: string, v: string) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* storage blocked */ } };
export const asSkin = (v: string): SkinId => (v === "chozo" || v === "phazon" ? v : "");

export function applySkin(id: SkinId, root: HTMLElement = document.documentElement): void {
  const p = id ? SKINS[id].palette : null;
  for (const [k, v] of Object.entries(VARS)) { if (p) root.style.setProperty(v, p[k as keyof typeof VARS]); else root.style.removeProperty(v); }
  if (p?.radius) root.style.setProperty("--radius", p.radius); else root.style.removeProperty("--radius");
  if (id) root.dataset.skin = id; else delete root.dataset.skin;
}
interface S { skin: SkinId; hud: boolean; setSkin: (s: SkinId) => void; setHud: (v: boolean) => void }
const initSkin = asSkin(get(SKIN_KEY)), initHud = get(HUD_KEY) === "1";
if (typeof document !== "undefined") { applySkin(initSkin); document.documentElement.classList.toggle("hud", initHud); }
export const useSkin = create<S>((set) => ({
  skin: initSkin, hud: initHud,
  setSkin: (s) => { put(SKIN_KEY, s); applySkin(s); set({ skin: s }); },
  setHud: (v) => { put(HUD_KEY, v ? "1" : ""); document.documentElement.classList.toggle("hud", v); set({ hud: v }); },
}));
