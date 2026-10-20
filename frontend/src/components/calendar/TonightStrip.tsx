// The tonight strip (fix418, idea 1): today's events in start order, the one under way marked "Now" and the first still to start marked
// "Next". Ended events are dimmed. When nothing is left to start today, the next event to come is named under the list.
import { useCalLang } from "../../lib/calendarI18n";
import { dayLabel, timeOf } from "../../lib/calendarTime";
import type { Occurrence } from "../../lib/calendarRepeat";
import type { Tonight } from "../../lib/calendarToday";
import "./calendarViz.css";

export function TonightStrip({ tonight, tz, onOpen }: { tonight: Tonight; tz: string; onOpen: (e: Occurrence) => void }) {
  const { t, locale } = useCalLang();
  const clock = (e: Occurrence) => (e.allDay ? t("all day") : timeOf(e.startsAt, tz));
  const { lines, after } = tonight;
  const nextListed = lines.some((l) => l.mark === "next");
  return (
    <section className="cal-tonight" aria-labelledby="cal-h-tonight">
      <h2 id="cal-h-tonight">{t("Tonight")}</h2>
      {lines.length ? (
        <ul className="cal-tonight-list">
          {lines.map(({ e, mark }) => (
            <li key={`${e.id}:${e.day}`}>
              <button type="button" className={`cal-row cal-tonight-row${mark === "over" ? " is-over" : ""}`} onClick={() => onOpen(e)}>
                <span className="cal-row-main">
                  <span className="cal-row-title">
                    {e.title}
                    {mark === "now" || mark === "next" ? <span className={`cal-badge is-${mark}`}>{t(mark === "now" ? "Now" : "Next")}</span> : null}
                  </span>
                  <span className="cal-dim">{clock(e)}{e.location ? ` · ${e.location}` : ""}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="cal-dim">{t("Nothing tonight.")}</p>}
      {!nextListed && after ? (
        <p className="cal-small">
          <button type="button" className="cal-link" onClick={() => onOpen(after)}>
            {t("Next: {title}, {day} · {clock}", { title: after.title, day: dayLabel(after.day, { weekday: "long", day: "numeric", month: "long" }, locale), clock: clock(after) })}
          </button>
        </p>
      ) : null}
    </section>
  );
}
