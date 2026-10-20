// The venue index (fix418, idea 4): the places the calendar holds that are still to come, the soonest first, each with how many events
// are there and the first of them. A tap puts the place in the search, so the page shows only what is at it.
import { useCalLang } from "../../lib/calendarI18n";
import { dayLabel } from "../../lib/calendarTime";
import type { Venue } from "../../lib/calendarToday";
import "./calendarViz.css";

const VENUES_MAX = 24; // the chips wrap on a phone; past this the rest is a count

export function VenueIndex({ venues, onPick }: { venues: Venue[]; onPick: (place: string) => void }) {
  const { t, locale } = useCalLang();
  if (!venues.length) return null;
  const shown = venues.slice(0, VENUES_MAX);
  return (
    <section className="cal-section" aria-labelledby="cal-h-venues">
      <h2 id="cal-h-venues">{t("Venues")}</h2>
      <p className="cal-dim cal-small">{t("Tap a place to search for it.")}</p>
      <ul className="cal-venues">
        {shown.map((v) => (
          <li key={v.place.toLowerCase()}>
            <button type="button" className="cal-venue" onClick={() => onPick(v.place)}>
              <span className="cal-venue-name">{v.place}</span>
              <span className="cal-dim cal-small">
                {t("{n} to come", { n: v.upcoming })} · {t("next {day}", { day: dayLabel(v.next.day, { weekday: "short", day: "numeric", month: "short" }, locale) })}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {venues.length > VENUES_MAX ? <p className="cal-dim cal-small">{t("+{n} more", { n: venues.length - VENUES_MAX })}</p> : null}
    </section>
  );
}
