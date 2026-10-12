/** Places: coordinates in any common spelling, the place written on a page, and the free OpenStreetMap geocoder. */

export interface LatLng { lat: number; lng: number }
const okLL = (lat: number, lng: number): LatLng | null => (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) ? { lat, lng } : null);
const num = (s: string): number => Number(s.replace(",", "."));

/** "48.8566, 2.3522", "48.8566 N 2.3522 E", "48°51′24″N 2°21′08″E", a Google/OSM map link or a geo: URI. Null when it isn't coordinates. */
export function parseLatLng(input: string): LatLng | null {
  const t = input.trim(); if (!t) return null;
  let m = /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/.exec(t) ?? /[?&](?:q|ll|query|center)=(-?\d{1,2}(?:\.\d+)?)(?:,|%2C)(-?\d{1,3}(?:\.\d+)?)/i.exec(t) ?? /mlat=(-?\d+(?:\.\d+)?)&(?:amp;)?mlon=(-?\d+(?:\.\d+)?)/i.exec(t) ?? /#map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(t) ?? /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i.exec(t);
  if (m) return okLL(+m[1], +m[2]);
  const dms = /(\d{1,3})\s*°\s*(\d{1,2})?\s*[′']?\s*(\d{1,2}(?:\.\d+)?)?\s*[″"]?\s*([NS])[\s,;/]*(\d{1,3})\s*°\s*(\d{1,2})?\s*[′']?\s*(\d{1,2}(?:\.\d+)?)?\s*[″"]?\s*([EW])/i.exec(t);
  if (dms) { const f = (d: string, mi: string | undefined, s: string | undefined, h: string) => (+d + (mi ? +mi / 60 : 0) + (s ? +s / 3600 : 0)) * (/[SW]/i.test(h) ? -1 : 1); return okLL(f(dms[1], dms[2], dms[3], dms[4]), f(dms[5], dms[6], dms[7], dms[8])); }
  m = /^(-?\d{1,2}(?:[.,]\d+)?)\s*([NS])?\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*([EW])?$/i.exec(t);
  if (m) { let lat = num(m[1]), lng = num(m[3]); if (/s/i.test(m[2] ?? "")) lat = -Math.abs(lat); if (/w/i.test(m[4] ?? "")) lng = -Math.abs(lng); return okLL(lat, lng); }
  return null;
}

/** The place a page says its event is in: map metadata first, then structured data, then a "Location:" line. */
export function findPlace(html: string, text: string): { place: string; lat: number | null; lng: number | null } {
  const meta = (n: string) => new RegExp(`<meta[^>]+name=["']${n}["'][^>]+content=["']([^"']+)["']`, "i").exec(html)?.[1];
  let lat: number | null = null, lng: number | null = null, place = "";
  const pos = meta("geo.position") ?? meta("ICBM"); if (pos) { const ll = parseLatLng(pos.replace(";", ",")); if (ll) { lat = ll.lat; lng = ll.lng; } }
  place = meta("geo.placename") ?? "";
  if (!place) {
    for (const j of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const walk = (n: unknown): string => {
          if (!n || typeof n !== "object") return ""; const o = n as Record<string, unknown>;
          const loc = o.location as Record<string, unknown> | string | undefined;
          if (typeof loc === "string") return loc;
          if (loc && typeof loc === "object") { const a = (loc.address ?? loc) as Record<string, unknown>; const parts = [loc.name, a.streetAddress, a.addressLocality, a.addressCountry].flatMap((x) => (typeof x === "string" ? [x] : x && typeof x === "object" && typeof (x as { name?: string }).name === "string" ? [(x as { name: string }).name] : [])); if (parts.length) { const g = loc.geo as Record<string, unknown> | undefined; if (g && lat === null) { const ll = okLL(Number(g.latitude), Number(g.longitude)); if (ll) { lat = ll.lat; lng = ll.lng; } } return parts.join(", "); } }
          for (const v of Object.values(o)) { const r = Array.isArray(v) ? v.map(walk).find(Boolean) ?? "" : walk(v); if (r) return r; }
          return "";
        };
        place = walk(JSON.parse(j[1]));
      } catch { /* not valid JSON-LD */ }
      if (place) break;
    }
  }
  if (!place) { const m = /^\s*(?:location|venue|where|lieu|ort|dónde|ubicación)\s*[:：]\s*(.{3,120})$/im.exec(text); if (m) place = m[1].trim(); }
  const link = /(?:google\.[a-z.]+\/maps[^\s"'<>]*|maps\.app\.goo\.gl[^\s"'<>]*|openstreetmap\.org\/[^\s"'<>]*)/i.exec(html);
  if (lat === null && link) { const ll = parseLatLng(`https://${link[0]}`); if (ll) { lat = ll.lat; lng = ll.lng; } }
  return { place: place.replace(/\s+/g, " ").slice(0, 160), lat, lng };
}

// ---- geocoding: OpenStreetMap's Nominatim, one question a second at most, answers remembered
const cache = new Map<string, LatLng & { label: string } | null>();
let last = 0;
export async function geocode(q: string, fetchImpl: typeof fetch = fetch): Promise<(LatLng & { label: string }) | null> {
  const key = q.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 160); if (!key) return null;
  const ll = parseLatLng(key); if (ll) return { ...ll, label: `${ll.lat.toFixed(4)}, ${ll.lng.toFixed(4)}` };
  if (cache.has(key)) return cache.get(key) ?? null;
  const gap = last + 1100 - Date.now(); if (gap > 0) await new Promise((r) => setTimeout(r, gap)); last = Date.now();
  try {
    const res = await fetchImpl(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(6000), headers: { "user-agent": "ExomusicaOutreach/1.0 (artist outreach tool)", accept: "application/json" } });
    if (!res.ok) return null;
    const hit = ((await res.json()) as { lat?: string; lon?: string; display_name?: string }[])[0];
    const out = hit ? { ...(okLL(Number(hit.lat), Number(hit.lon)) ?? null), label: String(hit.display_name ?? key).slice(0, 160) } as LatLng & { label: string } : null;
    const ok = out && Number.isFinite(out.lat) ? out : null; cache.set(key, ok); if (cache.size > 500) cache.delete(cache.keys().next().value as string); return ok;
  } catch { return null; }
}
