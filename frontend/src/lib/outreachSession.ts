/** Which Outreach workspace this browser is in, and the key it was let in with. Kept per workspace address, so several can be open over time. */
const KEY = "exomusica_outreach_sessions";
export interface OxSession { id: number; slug: string; name: string; token: string }
let current: OxSession | null = null;

const read = (): Record<string, OxSession> => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, OxSession>; } catch { return {}; } };
const write = (v: Record<string, OxSession>): void => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode: the session lasts until the tab closes */ } };

export const savedSession = (slug: string): OxSession | null => read()[slug] ?? null;
export const allSessions = (): OxSession[] => Object.values(read());
export function saveSession(s: OxSession): void { write({ ...read(), [s.slug]: s }); current = s; }
export function forgetSession(slug: string): void { const r = read(); delete r[slug]; write(r); if (current?.slug === slug) current = null; }
export const useSession = (s: OxSession | null): void => { current = s; };
export const currentSession = (): OxSession | null => current;

/** Paths that don't need a workspace key. */
const OPEN = /^\/api\/outreach\/(workspaces|enter|w\/)/;
export function outreachHeaders(path: string): Record<string, string> {
  if (!path.startsWith("/api/outreach/") || OPEN.test(path) || !current) return {};
  return { "x-outreach-ws": String(current.id), ...(current.token ? { "x-outreach-token": current.token } : {}) };
}

/** A file download that needs the same headers as any other call (the export of mail files, say). */
export async function oxDownload(path: string, body: unknown, fallbackName: string): Promise<void> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", ...outreachHeaders(path), ...(localStorage.getItem("exomusica_token") ? { Authorization: `Bearer ${localStorage.getItem("exomusica_token")}` } : {}) }, body: JSON.stringify(body) });
  if (!res.ok) { let msg = res.statusText; try { msg = ((await res.json()) as { error?: string }).error ?? msg; } catch { /* not json */ } throw new Error(msg); }
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob()); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
