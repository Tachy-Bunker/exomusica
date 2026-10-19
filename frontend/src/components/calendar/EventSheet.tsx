// One event, in full. On a phone it is a popup over the calendar, which stays visible behind a dark veil; the X closes it. A repeat
// asks first whether the change is for this day only or for the whole series. Editors may change or delete; everyone else reads.
import { useEffect } from "react";
import { whenText } from "../../lib/calendarTime";
import { useCalLang } from "../../lib/calendarI18n";
import { mapLink } from "../../lib/calendarPlace";
import type { Occurrence } from "../../lib/calendarRepeat";

export type Scope = "one" | "all";
export const REPEAT_WORDS: Record<string, string> = { daily: "Every day", weekly: "Every week", monthly: "Every month", yearly: "Every year" };

interface Props {
  e: Occurrence; tz: string; canEdit: boolean; onClose: () => void;
  onEdit: (scope: Scope) => void;
  onDelete: (scope: Scope) => void;
}

export function EventSheet({ e, tz, canEdit, onClose, onEdit, onDelete }: Props) {
  const { t, locale } = useCalLang();
  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const safeLink = e.url && /^https?:\/\//i.test(e.url) ? e.url : null;
  const repeat = e.repeated && e.recurrence ? t(REPEAT_WORDS[e.recurrence]) + (e.recurUntil ? ` · ${t("until {day}", { day: e.recurUntil })}` : "") : null;
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
        {e.location ? (
          <p><span className="cal-label">{t("Place")}</span> {e.location}
            {e.lat !== null && e.lng !== null ? <> · <a href={mapLink(e.lat, e.lng)} target="_blank" rel="noopener noreferrer nofollow">{t("Show on the map")}</a></> : null}
          </p>
        ) : null}
        {safeLink ? <p><span className="cal-label">{t("Link")}</span> <a href={safeLink} target="_blank" rel="noopener noreferrer nofollow">{safeLink}</a></p> : null}
        {e.text ? <p className="cal-text">{e.text}</p> : null}
        <p className="cal-dim">{t("Added by {name}", { name: e.addedBy || t("someone") })}</p>
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
