/** Places on the sheet: coordinates in any spelling, distance, "nearest first", and a link that opens in the maps app. Pure. */
export interface LatLng { lat: number; lng: number }
const okLL = (lat: number, lng: number): LatLng | null => (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) ? { lat, lng } : null);
const num = (s: string): number => Number(s.replace(",", "."));

/** "48.8566, 2.3522", "48.85 N 2.35 E", "48°51′24″N 2°21′08″E", a Google or OpenStreetMap link, or a geo: link. Null when it isn't coordinates. */
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

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export const fmtKm = (km: number): string => (km < 10 ? `${km.toFixed(1)} km` : km < 1000 ? `${Math.round(km)} km` : `${Math.round(km / 10) * 10} km`);

export interface Located { id: number; lat: number | null; lng: number | null }
/** Everything with coordinates, nearest first, with the distance. Ones without coordinates are left out (and counted by the caller). */
export function nearest<T extends Located>(list: T[], from: LatLng, maxKm = Infinity): { item: T; km: number }[] {
  return list.flatMap((item) => (item.lat !== null && item.lng !== null ? [{ item, km: haversineKm(from, { lat: item.lat, lng: item.lng }) }] : [])).filter((x) => x.km <= maxKm).sort((a, b) => a.km - b.km || a.item.id - b.item.id);
}

/** Links for a place: Google Maps opens the app on phones and the site on desktops; geo: is the Android/iOS-neutral fallback; OpenStreetMap needs no account. */
export function mapLinks(c: { place?: string; lat: number | null; lng: number | null }): { google: string; osm: string; geo: string } | null {
  if (c.lat !== null && c.lng !== null) { const p = `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`; return { google: `https://www.google.com/maps/search/?api=1&query=${p}`, osm: `https://www.openstreetmap.org/?mlat=${c.lat.toFixed(6)}&mlon=${c.lng.toFixed(6)}#map=13/${c.lat.toFixed(6)}/${c.lng.toFixed(6)}`, geo: `geo:${p}` }; }
  const q = (c.place ?? "").trim(); if (!q) return null;
  return { google: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`, osm: `https://www.openstreetmap.org/search?query=${encodeURIComponent(q)}`, geo: `geo:0,0?q=${encodeURIComponent(q)}` };
}
