// One event, in full. On a phone it is a popup over the calendar, which stays visible behind a dark veil; the X closes it. A repeat asks
// first whether a change is for this day only or for the whole series. The place opens in Google Maps or OpenStreetMap, or its coordinates
// are copied. "Add to calendar" downloads the event as a calendar file (a repeat comes as its whole series).
import { useEffect, useState } from "react";
import { whenText } from "../../lib/calendarTime";
import { useCalLang } from "../../lib/calendarI18n";
import { coordsText, googleMapsLink, mapLink } from "../../lib/calendarPlace";
import type { Occurrence } from "../../lib/calendarRepeat";
import { GoogleMapsIcon, ShareIcon } from "./Icons";

export type Scope = "one" | "all";
export const REPEAT_WORDS: Record<string, string> = { daily: "Every day", weekly: "Every week", monthly: "Every month", yearly: "Every year" };

interface Props {
  e: Occurrence; tz: string; canEdit: boolean; onClose: () => void;
  onEdit: (scope: Scope) => void;
  onDelete: (scope: Scope) => void;
  onCalendar: () => void;
}

export function EventSheet({ e, tz, canEdit, onClose, onEdit, onDelete, onCalendar }: Props) {
  const { t, locale } = useCalLang();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const safeLink = e.url && /^https?:\/\//i.test(e.url) ? e.url : null;
  const repeat = e.repeated && e.recurrence ? t(REPEAT_WORDS[e.recurrence]) + (e.recurUntil ? ` · ${t("until {day}", { day: e.recurUntil })}` : "") : null;
  const place = e.lat !== null && e.lng !== null ? { lat: e.lat, lng: e.lng } : null;
  const coords = place ? coordsText(place.lat, place.lng) : "";

  async function copyCoords() {
    if (!place) return;
    try {
      await navigator.clipboard.writeText(coords);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { setCopied(false); }
  }

  return (
    <div className="cal-sheet-back" onClick={onClose}>
      <article className="cal-sheet" role="dialog" aria-modal="true" aria-label={e.title} onClick={(ev) => ev.stopPropagation()}>
        <button type="button" className="cal-sheet-x" onClick={onClose} aria-label={t("Close")}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" /></svg>
        </button>
        {e.image ? <img className="cal-sheet-img" src={e.image.url} alt="" decoding="async" /> : null}
        <h2>{e.title}</h2>
        <p className="cal-dim">{whenText(e.startsAt, e.endsAt, e.allDay, tz, locale, t("all day"))}</p>
        {repeat ? <p className="cal-repeat">↻ {repeat}</p> : null}
        {e.location || place ? <p><span className="cal-label">{t("Place")}</span> {e.location}</p> : null}
        {place ? (
          <div className="cal-geo">
            <a className="cal-icon" href={googleMapsLink(place.lat, place.lng)} target="_blank" rel="noopener noreferrer nofollow" aria-label={t("Open in Google Maps")} title={t("Open in Google Maps")}>
              <GoogleMapsIcon />
            </a>
            <a className="cal-icon" href={mapLink(place.lat, place.lng)} target="_blank" rel="noopener noreferrer nofollow" aria-label={t("Open in OpenStreetMap")} title={t("Open in OpenStreetMap")}>
              <span className="cal-osm" aria-hidden="true">OSM</span>
            </a>
            <button type="button" className="cal-icon" onClick={() => void copyCoords()} aria-label={t("Copy the coordinates")} title={t("Copy the coordinates")}>
              <ShareIcon />
            </button>
            <span className="cal-dim cal-small">{coords}</span>
            {copied ? <span className="cal-note cal-small" role="status">{t("Coordinates copied.")}</span> : null}
          </div>
        ) : null}
        {safeLink ? <p><span className="cal-label">{t("Link")}</span> <a href={safeLink} target="_blank" rel="noopener noreferrer nofollow">{safeLink}</a></p> : null}
        {e.text ? <p className="cal-text">{e.text}</p> : null}
        <p className="cal-dim">{t("Added by {name}", { name: e.addedBy || t("someone") })}</p>
        <div className="cal-actions">
          <button type="button" onClick={onCalendar}>{t("Add to calendar")}</button>
        </div>
        {canEdit && e.repeated ? (
          <div className="cal-scope">
            <p className="cal-dim cal-small">{t("This is a repeat. Change or delete only this day, or the whole series.")}</p>
            <div className="cal-actions">
              <button type="button" onClick={() => onEdit("one")}>{t("Change this day")}</button>
              <button type="button" className="cal-danger" onClick={() => onDelete("one")}>{t("Delete this day")}</button>
              <button type="button" onClick={() => onEdit("all")}>{t("Change the series")}</button>
              <button type="button" className="cal-danger" onClick={() => onDelete("all")}>{t("Delete the series")}</button>
            </div>
          </div>
        ) : canEdit ? (
          <div className="cal-actions">
            <button type="button" onClick={() => onEdit("all")}>{t("Edit")}</button>
            <button type="button" className="cal-danger" onClick={() => onDelete("all")}>{t("Delete")}</button>
          </div>
        ) : null}
      </article>
    </div>
  );
}
