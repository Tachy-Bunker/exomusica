import { outreachHeaders } from "./outreachSession";
import { loadBegin, loadEnd } from "./loadWatch";

/** The account this browser last saw signed in: name and admin flag only. The session itself is an httpOnly cookie
 *  that page scripts cannot read, and the server checks it on every request. */
export interface CachedUser { id: number; username: string; isAdmin: boolean }
export const USER_KEY = "exomusica_user";
const LEGACY_TOKEN_KEY = "exomusica_token";

export function readCachedUser(): CachedUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as CachedUser) : null;
  } catch { return null; }
}
export function cacheUser(user: CachedUser): void {
  try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* storage blocked: the page asks the server on each load */ }
}
export function forgetUser(): void {
  try { localStorage.removeItem(USER_KEY); } catch { /* storage blocked */ }
}
/** Whether this browser last saw an account signed in. For the interface only: the server decides every real request. */
export function isSignedIn(): boolean {
  try { return localStorage.getItem(USER_KEY) !== null; } catch { return false; }
}
/** Takes the login token an older page kept in the browser, so it can be traded for the session cookie once. */
export function takeLegacyToken(): string | null {
  try {
    const t = localStorage.getItem(LEGACY_TOKEN_KEY);
    if (t) localStorage.removeItem(LEGACY_TOKEN_KEY);
    return t;
  } catch { return null; }
}

export class ApiError extends Error {
  /** `body` is the server's whole reply, for callers that need more than the short message (e.g. an upload's per-file reasons). */
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  loadBegin();
  try { return await apiInner<T>(path, options); } finally { loadEnd(); }
}

async function apiInner<T>(path: string, options: RequestInit): Promise<T> {
  const signedIn = isSignedIn();
  const isFormData = options.body instanceof FormData;
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.body && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...outreachHeaders(path),
      ...options.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : undefined;

  if (!res.ok) {
    if (res.status === 401 && signedIn && body?.error === "invalid or expired token") {
      // The session cookie was rejected (expired, signed out elsewhere, or the account was removed). Forget the
      // cached account so the interface shows signed-out, and let the auth provider reset.
      forgetUser();
      window.dispatchEvent(new Event("exomusica:session-expired"));
    }
    if (res.status === 401 && body?.locked) window.dispatchEvent(new Event("outreach:locked"));
    throw new ApiError(res.status, body?.error ?? res.statusText, body);
  }
  return body as T;
}
