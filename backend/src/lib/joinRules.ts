// Rules for join requests, kept pure so they can be tested without a database.

export const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Usernames are compared ignoring case, so "Tachy" and "tachy" are the same name. */
export const normalizeUsername = (s: string) => s.trim();
export const usernameKey = (s: string) => normalizeUsername(s).toLowerCase();

/** Emails are stored lower-case and trimmed: that is what makes a repeat submission recognisable. */
export const normalizeEmail = (s: string) => s.trim().toLowerCase();

export function validEmail(s: string): boolean {
  return s.length <= 254 && EMAIL_RE.test(s);
}

/**
 * Two requests for the same name (or the same email) must never run their "is it taken?" checks at the same moment, or both pass.
 * Each name and email gets a lock key; callers take the locks in this order (sorted, so two requests can never deadlock each other).
 */
export function joinLockKeys(username: string, email: string): string[] {
  return [`join:u:${usernameKey(username)}`, `join:e:${normalizeEmail(email)}`].sort();
}

export type JoinConflict = "username_pending" | "email_pending" | "username_taken" | "email_taken";

/** What to tell the person. The email messages are deliberately vague: they must not reveal who already has an account. */
export const JOIN_CONFLICT_MESSAGE: Record<JoinConflict, string> = {
  username_pending: "A request with that username is already waiting for review. If that was you, there's nothing more to do.",
  email_pending: "A request with that email is already waiting for review. If that was you, there's nothing more to do.",
  username_taken: "That username is already taken. Try another.",
  email_taken: "That email can't be used for a new request. If you already have an account, log in instead.",
};

interface Existing {
  pending: { username: string; email: string }[];
  realUsers: { username: string; email: string | null }[];
}

/** First conflict between a new request and what already exists (ghost accounts don't count: claiming one is an admin decision). */
export function findJoinConflict(username: string, email: string, existing: Existing): JoinConflict | null {
  const uKey = usernameKey(username);
  const eKey = normalizeEmail(email);
  if (existing.realUsers.some((u) => u.username.toLowerCase() === uKey)) return "username_taken";
  if (existing.realUsers.some((u) => u.email && normalizeEmail(u.email) === eKey)) return "email_taken";
  if (existing.pending.some((p) => p.username.toLowerCase() === uKey)) return "username_pending";
  if (existing.pending.some((p) => normalizeEmail(p.email) === eKey)) return "email_pending";
  return null;
}
