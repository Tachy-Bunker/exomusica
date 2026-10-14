// Whitelisted, validated profile input. Routes used to hand the request body straight to the database, so a member could
// have written any column (isAdmin, passwordHash...). Everything here is pure, so it is tested without a database.
import { USERNAME_RE, normalizeEmail, normalizeUsername, validEmail } from "./joinRules.js";

export type Link = { label: string; url: string };
type Rule = (v: unknown) => unknown | undefined; // undefined = invalid

const bool: Rule = (v) => (typeof v === "boolean" ? v : undefined);
const text = (max: number, nullable = true): Rule => (v) => {
  if (v === null) return nullable ? null : undefined;
  return typeof v === "string" && v.length <= max ? v : undefined;
};

export const cleanLinks: Rule = (v) => {
  if (v === null) return null;
  if (!Array.isArray(v) || v.length > 10) return undefined;
  const out: Link[] = [];
  for (const l of v) {
    if (!l || typeof l !== "object") return undefined;
    const label = String((l as Link).label ?? "").trim(), url = String((l as Link).url ?? "").trim();
    if (!label && !url) continue;
    if (label.length > 60 || url.length > 300 || !/^https?:\/\/\S+$/i.test(url)) return undefined;
    out.push({ label, url });
  }
  return out;
};

function pick(body: unknown, rules: Record<string, Rule>): { data: Record<string, unknown>; bad: string[] } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {}, bad: string[] = [];
  for (const [k, rule] of Object.entries(rules)) {
    if (!(k in b) || b[k] === undefined) continue;
    const v = rule(b[k]);
    if (v === undefined) bad.push(k); else data[k] = v;
  }
  return { data, bad };
}

export const memberProfile = (body: unknown) => pick(body, { bio: text(1000), links: cleanLinks });
export const memberVisualEffects = (body: unknown) => pick(body, { caEnabled: bool, moireEnabled: bool, exclusiveMediaPlayback: bool });
export const memberNotifications = (body: unknown) => pick(body, {
  notifyWeeklySummary: bool, notifyDailySummary: bool, notifyFollowedReplies: bool, notifyPrivateMessage: bool, notifyNews: bool,
  notifyCallsForIdeas: bool, notifyCallsForArtists: bool, notifyDiscordWeeklySummary: bool, notifyDiscordDailySummary: bool,
  notifyDiscordFollowedReplies: bool, notifyDiscordPrivateMessage: bool, discordUsername: text(100), discordUserId: text(40),
});

/** An avatar already on this site (so pasting a hosted picture's address works); never an outside address. */
export const hostedImagePath = (v: unknown): string | null =>
  typeof v === "string" && /^\/uploads\/[A-Za-z0-9_\-./]+$/.test(v) && !v.includes("..") && v.length <= 300 ? v : null;

export interface AdminEdit {
  data: Record<string, unknown>;       // columns to write
  password?: string;                   // plain, to be hashed by the route
  clear: { frame: boolean; tint: boolean };
  bad: string[];
  error?: string;
}

/** What an admin may change on someone else's profile. `self` blocks the one change that can lock you out. */
export function adminEdit(body: unknown, ctx: { isGhost: boolean; self: boolean }): AdminEdit {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const { data, bad } = pick(b, { bio: text(1000), links: cleanLinks, isAdmin: bool });
  const out: AdminEdit = { data, clear: { frame: b.clearFrame === true, tint: b.clearTint === true }, bad };

  if ("username" in b) {
    const u = typeof b.username === "string" ? normalizeUsername(b.username) : "";
    if (!USERNAME_RE.test(u)) bad.push("username"); else data.username = u;
  }
  if ("email" in b) {
    if (ctx.isGhost) out.error = "A ghost account has no email";
    else if (b.email === null || b.email === "") bad.push("email"); // a real account needs one to log in
    else {
      const e = typeof b.email === "string" ? normalizeEmail(b.email) : "";
      if (!validEmail(e)) bad.push("email"); else data.email = e;
    }
  }
  if ("storageLimitMb" in b) {
    const n = b.storageLimitMb;
    if (typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100_000) data.storageLimitBytes = BigInt(n) * 1024n * 1024n; else bad.push("storageLimitMb");
  }
  if ("avatarUrl" in b) {
    if (b.avatarUrl === null) data.avatarUrl = null;
    else { const p = hostedImagePath(b.avatarUrl); if (p) data.avatarUrl = p; else bad.push("avatarUrl"); }
  }
  if ("password" in b && b.password !== "" && b.password !== undefined) {
    if (ctx.isGhost) out.error = "A ghost account can't log in, so it has no password";
    else if (typeof b.password !== "string" || b.password.length < 8 || b.password.length > 200) bad.push("password");
    else out.password = b.password;
  }
  if (ctx.self && data.isAdmin === false) { delete data.isAdmin; out.error = "You can't remove your own admin rights; ask another admin"; }
  return out;
}
