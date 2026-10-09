// Small, pure helpers for the Signal page: labels, ordering, and what this device remembers (what it has seen, what it already tried).
export interface NodeLike { id: number; solved: boolean; hasAnswer: boolean }
export type Tab = "todo" | "done" | "all";

export const txLabel = (id: number): string => `TX-${String(id).padStart(3, "0")}`;

/** Unsolved first (the ones with something to do), solved after; the station's own order inside each group. */
export function sortNodes<T extends NodeLike>(nodes: T[]): T[] {
  return [...nodes].sort((a, b) => Number(a.solved) - Number(b.solved) || a.id - b.id);
}
export function filterNodes<T extends NodeLike>(nodes: T[], tab: Tab): T[] {
  return tab === "all" ? nodes : nodes.filter((n) => (tab === "done" ? n.solved : !n.solved));
}
export const counts = (nodes: NodeLike[]) => ({ todo: nodes.filter((n) => !n.solved).length, done: nodes.filter((n) => n.solved).length });
/** Which tab to open on: what is left to do, or everything when nothing is. */
export const defaultTab = (nodes: NodeLike[]): Tab => (nodes.some((n) => !n.solved) ? "todo" : "all");

/** What a wrong attempt is shown as: trimmed, one line, short. */
export const cleanAttempt = (s: string): string => s.replace(/\s+/g, " ").trim().slice(0, 60);

const SEEN = "exomusica_signal_seen", TRIED = "exomusica_signal_tried";
const read = <T,>(k: string, d: T): T => { try { const v = JSON.parse(localStorage.getItem(k) ?? ""); return v ?? d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

export const getSeen = (): number[] => { const v = read<unknown>(SEEN, []); return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : []; };
export const markSeen = (ids: number[]): void => write(SEEN, [...new Set([...getSeen(), ...ids])].slice(-300));

/** Wrong answers you already tried on one transmission (newest first, no repeats, at most 6), so you never retype or repeat yourself. */
export function getTried(id: number): string[] { const m = read<Record<string, string[]>>(TRIED, {}); return Array.isArray(m[id]) ? m[id] : []; }
export function addTried(id: number, attempt: string): string[] {
  const a = cleanAttempt(attempt);
  const m = read<Record<string, string[]>>(TRIED, {});
  const list = a ? [a, ...(m[id] ?? []).filter((x) => x.toLowerCase() !== a.toLowerCase())].slice(0, 6) : m[id] ?? [];
  m[id] = list; write(TRIED, m); return list;
}
export function clearTried(id: number): void { const m = read<Record<string, string[]>>(TRIED, {}); delete m[id]; write(TRIED, m); }
