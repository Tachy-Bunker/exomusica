import { create } from "zustand";
import { api } from "./api";

interface ResolvedMention {
  username: string;
  avatarUrl: string | null;
}

interface MentionResolutionState {
  cache: Map<string, ResolvedMention>;
  pending: Set<string>;
  version: number;
  resolve: (discordIds: string[]) => void;
}

export const useMentionResolutionStore = create<MentionResolutionState>((set, get) => ({
  cache: new Map(),
  pending: new Set(),
  version: 0,

  resolve: (discordIds) => {
    const { cache, pending } = get();
    const needed = discordIds.filter((id) => !cache.has(id) && !pending.has(id));
    if (needed.length === 0) return;

    needed.forEach((id) => pending.add(id));

    api<{ discordId: string; username: string; avatarUrl: string | null }[]>(
      `/api/users/discord-lookup?ids=${needed.join(",")}`,
    )
      .then((results) => {
        const { cache: currentCache } = get();
        const nextCache = new Map(currentCache);
        for (const r of results) {
          nextCache.set(r.discordId, { username: r.username, avatarUrl: r.avatarUrl });
        }
        set((s) => ({ cache: nextCache, version: s.version + 1 }));
      })
      .finally(() => {
        needed.forEach((id) => pending.delete(id));
      });
  },
}));
