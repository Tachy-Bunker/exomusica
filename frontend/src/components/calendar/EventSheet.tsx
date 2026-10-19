// One event, in full: its picture, when and where, its link and text. Editors may change or delete it; everyone else reads it.
import { useEffect } from "react";
import { whenText } from "../../lib/calendarTime";
import { useCalLang } from "../../lib/calendarI18n";
import type { CalEvent } from "../../lib/calendarApi";

export function EventSheet({ e, tz, canEdit, onClose, onEdit, onDelete }: { e: CalEvent; tz: string; canEdit: boolean; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const { t, locale } = useCalLang();
  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const safeLink = e.url && /^https?:\/\//i.test(e.url) ? e.url : null;
  return (
    <div className="cal-sheet-back" onClick={onClose}>
      <article className="cal-sheet" role="dialog" aria-modal="true" aria-label={e.title} onClick={(ev) => ev.stopPropagation()}>
        {e.image ? <img className="cal-sheet-img" src={e.image.url} alt="" decoding="async" /> : null}
        <h2>{e.title}</h2>
        <p className="cal-dim">{whenText(e.startsAt, e.endsAt, e.allDay, tz, locale, t("all day"))}</p>
        {e.location ? <p><span className="cal-label">{t("Place")}</span> {e.location}</p> : null}
        {safeLink ? <p><span className="cal-label">{t("Link")}</span> <a href={safeLink} target="_blank" rel="noopener noreferrer nofollow">{safeLink}</a></p> : null}
        {e.text ? <p className="cal-text">{e.text}</p> : null}
        <p className="cal-dim">{t("Added by {name}", { name: e.addedBy || t("someone") })}</p>
        <div className="cal-actions">
          {canEdit ? <button type="button" onClick={onEdit}>{t("Edit")}</button> : null}
          {canEdit ? <button type="button" className="cal-danger" onClick={onDelete}>{t("Delete")}</button> : null}
          <button type="button" className="cal-quiet" onClick={onClose}>{t("Close")}</button>
        </div>
      </article>
    </div>
  );
}
