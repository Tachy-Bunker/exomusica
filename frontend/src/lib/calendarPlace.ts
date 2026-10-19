// Places (fix414, fix415): reading typed coordinates, shortening an address for the line, and the links to a point. Pure.

/** "48.8566, 2.3522" or "48.8566 2.3522": a latitude then a longitude, in range. Anything else is null (it is then an address). */
export function parseCoordinates(text: string): { lat: number; lng: number } | null {
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)(?:\s*[,;]\s*|\s+)(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(text);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/** A short name from a long address: its first two parts ("Le Trianon, Paris" from "Le Trianon, 80 Boulevard de Rochechouart, Paris, France"). */
export function shortPlace(label: string): string {
  return label.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 2).join(", ").slice(0, 160);
}

/** A point as the OpenStreetMap site shows it (the same data the map draws from). */
export const mapLink = (lat: number, lng: number): string =>
  `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lng.toFixed(6)}#map=16/${lat.toFixed(6)}/${lng.toFixed(6)}`;

/** A point in Google Maps. */
export const googleMapsLink = (lat: number, lng: number): string =>
  `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;

/** The coordinates as text, "48.8566, 2.3522": what the share button copies. */
export const coordsText = (lat: number, lng: number): string => `${Number(lat.toFixed(6))}, ${Number(lng.toFixed(6))}`;
