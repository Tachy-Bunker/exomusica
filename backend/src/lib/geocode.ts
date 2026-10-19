// Address search for the calendar's places (fix414). It asks one fixed service: OpenStreetMap's Nominatim by default. Set GEOCODER_URL to
// point it at your own Nominatim (or any service that answers the same way), and GEOCODER_USER_AGENT to name your site.
// The public service asks for at most one request a second and an identifiable user agent; both are kept here. Every answer is kept
// for a week, so a place searched twice costs nothing. The only thing sent out is the typed address, as a query string to that one host.
export interface Place { lat: number; lng: number; label: string }

const SERVICE = process.env.GEOCODER_URL || "https://nominatim.openstreetmap.org/search";
const AGENT = process.env.GEOCODER_USER_AGENT || "ExomusicaCalendar/1.0 (calendar places)";
const GAP_MS = 1100;          // one request, then a short rest
const MAX_QUEUED = 20;        // more than this waiting: say the search is busy, do not pile up
const TTL_MS = 7 * 24 * 3600_000;
const MAX_KEPT = 1000;

const kept = new Map<string, { at: number; places: Place[] }>();
let chain: Promise<unknown> = Promise.resolve();
let queued = 0;
let lastSent = 0;

export class GeocodeBusy extends Error {}
export class GeocodeDown extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The answers of the service for one address, at most five. Throws GeocodeBusy or GeocodeDown. */
export async function geocode(raw: string): Promise<Place[]> {
  const q = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  const key = q.toLowerCase();
  const hit = kept.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.places;

  if (queued >= MAX_QUEUED) throw new GeocodeBusy("The address search is busy. Try again in a moment.");
  queued += 1;
  const run = chain.then(async () => {
    const wait = lastSent + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastSent = Date.now();
    return ask(q);
  });
  chain = run.catch(() => undefined);
  let places: Place[];
  try { places = await run; }
  finally { queued -= 1; }

  if (kept.size >= MAX_KEPT) kept.delete(kept.keys().next().value as string);
  kept.set(key, { at: Date.now(), places });
  return places;
}

async function ask(q: string): Promise<Place[]> {
  const url = new URL(SERVICE);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("accept-language", "fr,en");
  let rows: unknown;
  try {
    const res = await fetch(url, { headers: { "user-agent": AGENT, accept: "application/json" }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    rows = await res.json();
  } catch {
    throw new GeocodeDown("The address search did not answer. Try again in a moment.");
  }
  if (!Array.isArray(rows)) return [];
  const out: Place[] = [];
  for (const r of rows.slice(0, 5)) {
    const row = r as { lat?: unknown; lon?: unknown; display_name?: unknown };
    const lat = Number(row.lat), lng = Number(row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    out.push({ lat, lng, label: String(row.display_name ?? "").slice(0, 200) });
  }
  return out;
}
