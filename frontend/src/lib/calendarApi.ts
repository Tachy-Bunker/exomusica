// Calendar client: the calls, and the token each calendar's password earned (kept per address, in this browser only).
import { api } from "./api";
import { compressImageToMaxSize } from "./compressImage";

export type EditMode = "guests" | "members";
export interface CalInfo { slug: string; name: string; timezone: string; protected: boolean; editMode: EditMode; members: string[]; pictureCap: number }
/** A calendar as this caller sees it: locked to them or not, may change its events, may change its settings. */
export interface CalView extends CalInfo { locked: boolean; canEdit: boolean; canManage: boolean }
export interface CalListItem extends CalInfo { events: number }
export interface CalImage { id: number; url: string }
export interface CalEvent {
  id: number; title: string; text: string; url: string | null; location: string;
  startsAt: string; endsAt: string | null; allDay: boolean; addedBy: string;
  image: CalImage | null; createdAt: string; updatedAt: string;
}
export interface EventInput {
  title: string; text: string; url: string | null; location: string;
  startsAt: string; endsAt: string | null; allDay: boolean; imageId: number | null; addedBy: string;
}
/** `removed`: how many older pictures went to make room (the calendar's picture limit). */
export interface LinkPreview { url: string; title: string; description: string | null; siteName: string | null; image: CalImage | null; removed: number }
export interface UploadedPicture extends CalImage { removed: number }

const KEY = "exomusica_calendar_tokens";
const readAll = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>; } catch { return {}; } };
const writeAll = (m: Record<string, string>): void => { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* storage blocked: the password is asked again */ } };
export const savedToken = (slug: string): string | null => readAll()[slug] ?? null;
export const saveToken = (slug: string, token: string): void => writeAll({ ...readAll(), [slug]: token });
export const dropToken = (slug: string): void => { const m = readAll(); delete m[slug]; writeAll(m); };

const base = (slug: string): string => `/api/calendars/${encodeURIComponent(slug)}`;
const headers = (slug: string): Record<string, string> => { const t = savedToken(slug); return t ? { "x-calendar-token": t } : {}; };
const keepToken = (slug: string, token?: string): void => { if (token) saveToken(slug, token); };

export const listCalendars = () => api<{ calendars: CalListItem[]; canCreate: boolean }>("/api/calendars");
export const getCalendar = (slug: string) => api<CalView>(base(slug), { headers: headers(slug) });

/** The password from the link (or typed in). A right one keeps a token for this calendar. */
export async function enterCalendar(slug: string, password: string): Promise<CalInfo> {
  const r = await api<{ token: string; calendar: CalInfo }>("/api/calendars/enter", { method: "POST", body: JSON.stringify({ slug, password }) });
  saveToken(slug, r.token);
  return r.calendar;
}

export interface NewCalendar { name: string; slug?: string; timezone: string; password?: string; editMode?: EditMode; members?: string; pictureCap?: number }
export async function createCalendar(body: NewCalendar): Promise<CalInfo> {
  const r = await api<{ calendar: CalInfo; token?: string }>("/api/calendars", { method: "POST", body: JSON.stringify(body) });
  keepToken(r.calendar.slug, r.token);
  return r.calendar;
}

export interface CalendarChange { name?: string; timezone?: string; password?: string | null; currentPassword?: string; editMode?: EditMode; members?: string; pictureCap?: number }
export async function updateCalendar(slug: string, body: CalendarChange): Promise<CalView> {
  const r = await api<{ calendar: CalView; token?: string }>(base(slug), { method: "PATCH", body: JSON.stringify(body), headers: headers(slug) });
  keepToken(slug, r.token);
  return r.calendar;
}

/** Everyone else is signed out; this browser keeps working with the token it is given back. */
export async function signOutEveryone(slug: string): Promise<void> {
  const r = await api<{ token?: string }>(`${base(slug)}/sign-out-everyone`, { method: "POST", headers: headers(slug) });
  keepToken(slug, r.token);
}

export const deleteCalendar = (slug: string) => api<void>(base(slug), { method: "DELETE" });

export function listEvents(slug: string, range: { from?: string; to?: string; q?: string }) {
  const p = new URLSearchParams();
  if (range.from) p.set("from", range.from);
  if (range.to) p.set("to", range.to);
  if (range.q) p.set("q", range.q);
  return api<{ events: CalEvent[]; truncated: boolean; calendar: CalInfo; canEdit: boolean }>(`${base(slug)}/events?${p}`, { headers: headers(slug) });
}
export const addEvent = (slug: string, body: EventInput) => api<CalEvent>(`${base(slug)}/events`, { method: "POST", body: JSON.stringify(body), headers: headers(slug) });
export const editEvent = (slug: string, id: number, body: EventInput) => api<CalEvent>(`${base(slug)}/events/${id}`, { method: "PUT", body: JSON.stringify(body), headers: headers(slug) });
export const removeEvent = (slug: string, id: number) => api<void>(`${base(slug)}/events/${id}`, { method: "DELETE", headers: headers(slug) });
export const previewLink = (slug: string, url: string) => api<LinkPreview>(`${base(slug)}/link-preview`, { method: "POST", body: JSON.stringify({ url }), headers: headers(slug) });

const ONE_MB = 1_000_000;
/** A picture from the device, made small enough first (a phone photo is often several MB). */
export async function uploadPicture(slug: string, file: File): Promise<UploadedPicture> {
  const small = await compressImageToMaxSize(file, ONE_MB);
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error("The picture could not be read."));
    r.readAsDataURL(small);
  });
  return api<UploadedPicture>(`${base(slug)}/images`, { method: "POST", body: JSON.stringify({ data: data.replace(/^data:[^,]*,/, "") }), headers: headers(slug) });
}

/** The name a guest is known by on this device (shown as "added by"). */
const NAME_KEY = "exomusica_calendar_name";
export const savedName = (): string => { try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; } };
export const rememberName = (name: string): void => { try { localStorage.setItem(NAME_KEY, name); } catch { /* storage blocked */ } };

/** The words to show for a failed call: the server's sentence when it has one (translated by the calendar's language, see calendarI18n). */
export function messageOf(x: unknown): string {
  if (x instanceof Error && x.message) return x.message;
  return "Something went wrong. Try again.";
}
