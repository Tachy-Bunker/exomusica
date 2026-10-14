import { api } from "./api";
import { useToastStore } from "./toastStore";
// What has been probed: kept on this device always, and sent to the account when logged in (so the Field Log follows you).
const KEY = "exomusica_scans";
const read = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]); } catch { return new Set(); } };
const write = (s: Set<string>) => { try { localStorage.setItem(KEY, JSON.stringify([...s].slice(-3000))); } catch { /* storage blocked */ } };

export const scanId = (kind: string, key: string): string => `${kind}|${key}`;
export const scannedIds = (): Set<string> => read();
export const hasScanned = (kind: string, key: string): boolean => read().has(scanId(kind, key));
export function recordScan(kind: string, key: string, loggedIn: boolean): boolean {
  const s = read(), id = scanId(kind, key), fresh = !s.has(id);
  if (fresh) { s.add(id); write(s); }
  if (loggedIn) void api<{ earned?: string[] } | undefined>("/api/scans", { method: "POST", body: JSON.stringify({ kind, key }) }).then((r) => { if (r?.earned?.length) useToastStore.getState().showToast(`Suit upgrade: ${r.earned.join(", ")}. See the Field Log.`); }).catch(() => undefined);
  return fresh;
}
/** On login: bring the account's scans down, and send up any this device has that the account doesn't. */
export async function syncScans(): Promise<void> {
  const mine = await api<{ kind: string; key: string }[]>("/api/scans").catch(() => null);
  if (!Array.isArray(mine)) return;
  const local = read(), remote = new Set(mine.map((m) => scanId(m.kind, m.key)));
  for (const id of remote) local.add(id);
  write(local);
  for (const id of local) if (!remote.has(id)) { const [kind, ...k] = id.split("|"); void api("/api/scans", { method: "POST", body: JSON.stringify({ kind, key: k.join("|") }) }).catch(() => undefined); }
}
