// The subscription links of a calendar (idea 10, fix420). Apple Calendar, Outlook and phones take the webcal:// address, which opens
// the subscribe prompt by itself. Google Calendar's "From URL" wants the same address with https://. A protected calendar's links carry
// its key as ?k=; an open calendar's need none. Pure: the origin is passed in.
export interface FeedLinks { webcal: string; https: string }

export function feedLinks(origin: string, slug: string, key: string | null): FeedLinks {
  const path = `/api/calendars/${encodeURIComponent(slug)}/feed.ics`;
  const query = key ? `?k=${encodeURIComponent(key)}` : "";
  const https = `${origin.replace(/\/+$/, "")}${path}${query}`;
  return { webcal: https.replace(/^https?:\/\//i, "webcal://"), https };
}
