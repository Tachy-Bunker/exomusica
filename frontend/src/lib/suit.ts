import { api } from "./api";
export interface SuitItem { key: string; title: string; earned: boolean; perk?: string; level?: 0 | 1 | 2; hint?: string }
export type SuitMilestone = import("./milestones").Milestone;
export interface SuitData { items: SuitItem[]; choice: SuitChoice; milestones?: SuitMilestone[]; slots?: { playlists: { used: number; cap: number } } }
export interface SuitChoice { frame: string | null; tint: string | null }

/** The member's own scan-visor colour. A stylesheet rule (!important) lets it win over the site-wide setting without touching it. */
export function applyTint(tint: string | null | undefined): void {
  const root = document.documentElement;
  if (tint && /^#[0-9a-fA-F]{6}$/.test(tint)) { root.style.setProperty("--own-tint", tint); root.setAttribute("data-tint", "1"); }
  else { root.style.removeProperty("--own-tint"); root.removeAttribute("data-tint"); }
}
export async function loadChoice(): Promise<void> {
  const c = await api<SuitChoice>("/api/upgrades/choice").catch(() => null);
  applyTint(c?.tint);
}
