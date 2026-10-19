// The Places section (fix414): a map with a dot for every event that has a place. Drag a box on the map to select a zone (events inside
// it are listed), or search an address (or type "lat, lng") to fly there. With no zone, the list is the events in view.
// Loaded only when the page renders it (lazy), so a phone that never opens Places never downloads the map.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { geocodeAddress, messageOf, type Place } from "../../lib/calendarApi";
import { useCalLang } from "../../lib/calendarI18n";
import { parseCoordinates, shortPlace } from "../../lib/calendarPlace";
import { timeOf, dayKey, dayLabel } from "../../lib/calendarTime";
import type { Occurrence } from "../../lib/calendarRepeat";

const PARIS: [number, number] = [48.8566, 2.3522];
const LIST_MAX = 60;

interface Props { slug: string; tz: string; events: Occurrence[]; onOpen: (e: Occurrence) => void }

export default function PlacesSection({ slug, tz, events, onOpen }: Props) {
  const { t, locale } = useCalLang();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const dotsRef = useRef<L.LayerGroup | null>(null);
  const zoneLayerRef = useRef<L.Rectangle | null>(null);
  const pinRef = useRef<L.CircleMarker | null>(null);
  const fittedRef = useRef(false);
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  const [zoneOn, setZoneOn] = useState(false);
  const [zone, setZone] = useState<L.LatLngBounds | null>(null);
  const [view, setView] = useState<L.LatLngBounds | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Place[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const placed = useMemo(() => events.filter((e) => e.lat !== null && e.lng !== null), [events]);
  const unplaced = events.length - placed.length;
  const area = zone ?? view;
  const inArea = useMemo(() => (area ? placed.filter((e) => area.contains([e.lat as number, e.lng as number])) : []), [area, placed]);

  // The map, once. Its zoom and drags are its own; the page only hears where it is looking.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const map = L.map(box, { worldCopyJump: true }).setView(PARIS, 5);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer">OpenStreetMap</a>',
    }).addTo(map);
    dotsRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const sync = () => setView(map.getBounds());
    map.on("moveend", sync);
    sync();
    const fix = window.setTimeout(() => map.invalidateSize(), 0);
    return () => { window.clearTimeout(fix); map.remove(); mapRef.current = null; dotsRef.current = null; };
  }, []);

  // One dot per event with a place. The first time, the map fits them all.
  useEffect(() => {
    const map = mapRef.current, layer = dotsRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    for (const e of placed) {
      const dot = L.circleMarker([e.lat as number, e.lng as number], { radius: 6, color: "#eef1fb", weight: 1.5, fillColor: "#e2703f", fillOpacity: 0.95 });
      dot.bindTooltip(e.title);
      dot.on("click", () => openRef.current(e));
      dot.addTo(layer);
    }
    if (!fittedRef.current && placed.length) {
      map.fitBounds(L.latLngBounds(placed.map((e) => [e.lat as number, e.lng as number] as [number, number])), { padding: [32, 32], maxZoom: 13, animate: false });
      fittedRef.current = true;
    }
  }, [placed]);

  // Drawing a zone: while on, the map does not pan; a drag from one corner to the other draws the box, and letting go keeps it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!zoneOn) { map.dragging.enable(); return; }
    map.dragging.disable();
    const el = map.getContainer();
    el.classList.add("is-zoning");
    let start: L.LatLng | null = null;
    let box: L.Rectangle | null = null;
    const down = (ev: PointerEvent) => { start = map.mouseEventToLatLng(ev); };
    const move = (ev: PointerEvent) => {
      if (!start) return;
      const b = L.latLngBounds(start, map.mouseEventToLatLng(ev));
      if (box) box.setBounds(b); else box = L.rectangle(b, { color: "#4fa8e0", weight: 2, fillOpacity: 0.14, interactive: false }).addTo(map);
    };
    const up = () => {
      if (!start) return;
      start = null;
      if (box) { setZone(box.getBounds()); }
      setZoneOn(false);
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      el.classList.remove("is-zoning");
      if (box) (box as L.Rectangle).remove();
      map.dragging.enable();
    };
  }, [zoneOn]);

  // The zone as it stands: drawn on the map once it is set, removed when cleared.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    zoneLayerRef.current?.remove();
    zoneLayerRef.current = zone ? L.rectangle(zone, { color: "#4fa8e0", weight: 2, fillOpacity: 0.14, interactive: false }).addTo(map) : null;
  }, [zone]);

  function flyTo(lat: number, lng: number) {
    const map = mapRef.current;
    if (!map) return;
    map.setView([lat, lng], 14, { animate: false });
    pinRef.current?.remove();
    pinRef.current = L.circleMarker([lat, lng], { radius: 8, color: "#4fa8e0", weight: 2, fillColor: "#4fa8e0", fillOpacity: 0.35, interactive: false }).addTo(map);
  }

  async function search(e: FormEvent) {
    e.preventDefault();
    setErr(""); setFound([]);
    const typed = q.trim();
    if (!typed) return;
    const at = parseCoordinates(typed);
    if (at) { flyTo(at.lat, at.lng); return; }
    setBusy(true);
    try {
      const places = await geocodeAddress(slug, typed);
      if (!places.length) setErr(t("Nothing found for that address."));
      setFound(places);
    } catch (x) { setErr(messageOf(x)); }
    finally { setBusy(false); }
  }

  const shown = inArea.slice().sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).slice(0, LIST_MAX);
  return (
    <section className="cal-section" aria-labelledby="cal-h-places">
      <h2 id="cal-h-places">{t("Places")}</h2>
      <form className="cal-places-search" onSubmit={search}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("An address, a place, or “48.85, 2.35”")} aria-label={t("Search an address")} maxLength={160} />
        <button type="submit" className="cal-quiet" disabled={busy || !q.trim()}>{busy ? "…" : t("Search")}</button>
      </form>
      {err ? <p className="cal-err cal-small" role="alert">{err}</p> : null}
      {found.length ? (
        <ul className="cal-found">
          {found.map((p) => (
            <li key={`${p.lat},${p.lng}`}>
              <button type="button" className="cal-place" onClick={() => { flyTo(p.lat, p.lng); setFound([]); }}>
                <span>{shortPlace(p.label)}</span><span className="cal-dim cal-small">{p.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="cal-zone-bar">
        {zone ? <button type="button" className="cal-quiet" onClick={() => setZone(null)}>{t("Clear the zone")}</button> : null}
        <button type="button" className={`cal-quiet${zoneOn ? " is-on" : ""}`} aria-pressed={zoneOn} onClick={() => setZoneOn((z) => !z)}>
          {zoneOn ? t("Drag a box on the map…") : t("Select a zone")}
        </button>
      </div>
      <div ref={boxRef} className="cal-map" role="region" aria-label={t("Map of the events")} />
      <p className="cal-dim cal-small">{t("Each dot is an event with a place. {n} event(s) have no place on the map.", { n: unplaced })}</p>

      <h3>{zone ? t("In the zone: {n}", { n: inArea.length }) : t("In view: {n}", { n: inArea.length })}</h3>
      {shown.length ? (
        <div className="cal-agenda">
          {shown.map((e) => (
            <button key={`${e.id}:${e.day}`} type="button" className="cal-row" onClick={() => onOpen(e)}>
              <span className="cal-row-main">
                <span className="cal-row-title">{e.title}</span>
                <span className="cal-dim">{dayLabel(dayKey(e.startsAt, tz), { weekday: "short", day: "numeric", month: "short" }, locale)} · {e.allDay ? t("all day") : timeOf(e.startsAt, tz)}{e.location ? ` · ${e.location}` : ""}</span>
              </span>
            </button>
          ))}
          {inArea.length > LIST_MAX ? <p className="cal-dim cal-small">{t("+{n} more", { n: inArea.length - LIST_MAX })}</p> : null}
        </div>
      ) : <p className="cal-empty">{t("No event with a place in this area.")}</p>}
    </section>
  );
}
