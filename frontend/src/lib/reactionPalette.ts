import { create } from "zustand";

/** The emoji ids the open room's branch offers first when reacting. Set by the room, empty elsewhere. */
export const useReactionPalette = create<{ ids: number[]; set: (ids: number[]) => void }>((set) => ({ ids: [], set: (ids) => set({ ids }) }));

/** Branch picks first (in the branch's order), then everything else. Unknown ids are skipped. */
export function paletteFirst<T extends { id: number }>(all: T[], ids: number[]): { picked: T[]; rest: T[] } {
  const byId = new Map(all.map((e) => [e.id, e]));
  const picked = ids.map((i) => byId.get(i)).filter((e): e is T => !!e);
  const set = new Set(picked.map((e) => e.id));
  return { picked, rest: all.filter((e) => !set.has(e.id)) };
}
