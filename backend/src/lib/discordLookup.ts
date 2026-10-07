// Finding a member's Discord account (for their avatar, for mentions, for DMs) reliably. The Discord calls are passed in, so the logic is
// tested without Discord: caching, one retry, one lookup at a time per member, and an old answer rather than none when Discord hiccups.

export interface DiscordIdentity { discordUserId?: string | null; discordUsername?: string | null }
export interface FoundDiscordUser { id: string; username: string; avatarUrl: string }

export interface LookupDeps {
  /** Fetch by snowflake id; throws if it can't. `force` skips discord.js's own cache so the avatar is current. */
  fetchById(id: string, force: boolean): Promise<FoundDiscordUser>;
  /** Search the bot's servers for an exact username; null if nobody matches, throws if the search itself failed. */
  searchByUsername(username: string): Promise<FoundDiscordUser | null>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** How long an answer is used as it is (default 30 minutes): short enough to follow a changed picture. */
  freshMs?: number;
  /** How long "nobody found" is remembered (default one minute), so a missing account isn't searched for on every message. */
  missMs?: number;
  retryDelayMs?: number;
}

/** A member's own Discord id wherever the site has one: set by them, captured directly, or from a Discord-import account linked to theirs. */
export function discordIdOf(u: { discordUserId?: string | null; discordId?: string | null; linkedGhosts?: { discordId: string | null }[] }): string | null {
  return u.discordUserId ?? u.discordId ?? u.linkedGhosts?.find((g) => g.discordId)?.discordId ?? null;
}

export function createDiscordLookup(deps: LookupDeps) {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const freshMs = deps.freshMs ?? 30 * 60_000;
  const missMs = deps.missMs ?? 60_000;
  const retryDelayMs = deps.retryDelayMs ?? 400;
  const cache = new Map<string, { user: FoundDiscordUser; at: number }>();
  const misses = new Map<string, number>();
  const inflight = new Map<string, Promise<FoundDiscordUser | null>>();

  const keysOf = (i: DiscordIdentity): string[] => [i.discordUserId ? `id:${i.discordUserId}` : "", i.discordUsername ? `name:${i.discordUsername.trim().toLowerCase()}` : ""].filter(Boolean);
  const remember = (user: FoundDiscordUser, keys: string[]) => {
    const entry = { user, at: now() };
    for (const k of [...keys, `id:${user.id}`, `name:${user.username.toLowerCase()}`]) { cache.set(k, entry); misses.delete(k); }
  };
  /** One retry after a short pause: most Discord failures are momentary. A "no match" answer is an answer, not a failure. */
  async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
    try { return { ok: true, value: await fn() }; } catch { /* try once more */ }
    await sleep(retryDelayMs);
    try { return { ok: true, value: await fn() }; } catch { return { ok: false }; }
  }

  async function lookUp(identity: DiscordIdentity, keys: string[]): Promise<FoundDiscordUser | null> {
    const stale = () => keys.map((k) => cache.get(k)).find(Boolean)?.user ?? null;
    let failed = false;
    if (identity.discordUserId) {
      const r = await attempt(() => deps.fetchById(identity.discordUserId!, true));
      if (r.ok) { remember(r.value, keys); return r.value; }
      failed = true;
    }
    if (identity.discordUsername) {
      const r = await attempt(() => deps.searchByUsername(identity.discordUsername!.trim()));
      if (r.ok && r.value) { remember(r.value, keys); return r.value; }
      if (!r.ok) failed = true;
    }
    const old = stale();
    if (old) return old; // an out-of-date picture is better than the default one
    if (!failed) for (const k of keys) misses.set(k, now());
    return null;
  }

  return {
    /** The Discord account behind an identity, or null. */
    async resolve(identity: DiscordIdentity): Promise<FoundDiscordUser | null> {
      const keys = keysOf(identity);
      if (keys.length === 0) return null;
      const t = now();
      const hit = keys.map((k) => cache.get(k)).find((e) => e && t - e.at < freshMs);
      if (hit) return hit.user;
      const stale = keys.map((k) => cache.get(k)).find(Boolean);
      if (!stale && keys.every((k) => misses.has(k) && t - misses.get(k)! < missMs)) return null;
      const lockKey = keys[0];
      const running = inflight.get(lockKey);
      if (running) return running; // several messages at once share one lookup
      const p = lookUp(identity, keys).finally(() => inflight.delete(lockKey));
      inflight.set(lockKey, p);
      return p;
    },
    clear(): void { cache.clear(); misses.clear(); },
  };
}
