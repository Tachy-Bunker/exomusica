// The calendar's sections, stacked: Month, Week, Agenda. Each gets the events already expanded (repeats included) and already searched,
// and draws them; the page loads and filters. The Places section is its own file (lazy: the map loads only when it is opened).
import { useMemo } from "react";
import { addDays, dayLabel, monthCells, parseKey, timeOf } from "../../lib/calendarTime";
import { useCalLang } from "../../lib/calendarI18n";
import type { Occurrence } from "../../lib/calendarRepeat";

/** The events grouped by their day, in the order they came. */
export function byDay(events: Occurrence[]): Map<string, Occurrence[]> {
  const m = new Map<string, Occurrence[]>();
  for (const e of events) {
    const list = m.get(e.day);
    if (list) list.push(e); else m.set(e.day, [e]);
  }
  return m;
}

function EventRow({ e, tz, onOpen }: { e: Occurrence; tz: string; onOpen: (e: Occurrence) => void }) {
  const { t } = useCalLang();
  const clock = e.allDay ? t("all day") : timeOf(e.startsAt, tz);
  return (
    <button type="button" className="cal-row" onClick={() => onOpen(e)}>
      {e.image ? <img className="cal-thumb" src={e.image.url} alt="" loading="lazy" decoding="async" /> : null}
      <span className="cal-row-main">
        <span className="cal-row-title">{e.title}</span>
        <span className="cal-dim">{clock}{e.location ? ` · ${e.location}` : ""}</span>
      </span>
    </button>
  );
}

/** A section's heading row: the title in the middle, the buttons either side. */
export function SectionBar({ title, prev, next, nowLabel, onNow, prevLabel, nextLabel }: {
  title: string; prev: () => void; next: () => void; nowLabel: string; onNow: () => void; prevLabel: string; nextLabel: string;
}) {
  return (
    <div className="cal-bar">
      <button type="button" className="cal-quiet cal-step" aria-label={prevLabel} onClick={prev}>‹</button>
      <strong className="cal-title">{title}</strong>
      <button type="button" className="cal-quiet cal-step" aria-label={nextLabel} onClick={next}>›</button>
      <button type="button" className="cal-quiet" onClick={onNow}>{nowLabel}</button>
    </div>
  );
}

const CHIPS = 2; // event titles shown in a month cell on a wide screen; the rest is a count

interface MonthProps {
  cursor: string; today: string; day: string | null; tz: string; events: Occurrence[];
  onDay: (k: string) => void; onOpen: (e: Occurrence) => void; onMove: (n: number) => void; onToday: () => void;
}

/** Six Monday-first weeks. An empty day is a small number; a day with events is tinted, with its count. On a phone the titles hide
 *  and the count stays; tapping a day lists its events under the grid. */
export function MonthView({ cursor, today, day, tz, events, onDay, onOpen, onMove, onToday }: MonthProps) {
  const { t, locale } = useCalLang();
  const { y, m } = parseKey(cursor);
  const cells = useMemo(() => monthCells(y, m), [y, m]);
  const days = useMemo(() => byDay(events), [events]);
  const picked = day ? days.get(day) ?? [] : [];
  const clockOf = (e: Occurrence) => (e.allDay ? t("all day") : timeOf(e.startsAt, tz));
  const title = dayLabel(cursor, { month: "long", year: "numeric" }, locale);
  return (
    <section className="cal-section" aria-labelledby="cal-h-month">
      <h2 id="cal-h-month">{t("Month")}</h2>
      <SectionBar title={title} prev={() => onMove(-1)} next={() => onMove(1)} nowLabel={t("Today")} onNow={onToday} prevLabel={t("Previous month")} nextLabel={t("Next month")} />
      <div className="cal-month">
        <div className="cal-month-head" aria-hidden="true">
          {cells.slice(0, 7).map((k) => <span key={k}>{dayLabel(k, { weekday: "short" }, locale)}</span>)}
        </div>
        <div className="cal-month-grid">
          {cells.map((k) => {
            const list = days.get(k) ?? [];
            const cls = ["cal-cell", k.slice(0, 7) !== cursor.slice(0, 7) ? "is-out" : "", k === today ? "is-today" : "", k === day ? "is-picked" : "", list.length ? "has-events" : ""].filter(Boolean).join(" ");
            const full = dayLabel(k, { weekday: "long", day: "numeric", month: "long" }, locale);
            return (
              <div key={k} className={cls}>
                <button type="button" className="cal-daynum" onClick={() => onDay(k)} aria-current={k === today ? "date" : undefined}
                  aria-label={`${full}${list.length ? `, ${list.length === 1 ? t("1 event") : t("{n} events", { n: list.length })}` : ""}`}>
                  {Number(k.slice(8))}
                </button>
                {list.length ? <span className="cal-count" aria-hidden="true">{list.length}</span> : null}
                {list.length ? (
                  <span className="cal-chips">
                    {list.slice(0, CHIPS).map((e, i) => (
                      <button key={`${e.id}:${e.day}:${i}`} type="button" className="cal-chip" title={`${clockOf(e)} ${e.title}`} onClick={() => onOpen(e)}>
                        <span className="cal-chip-clock">{clockOf(e)}</span> <span className="cal-chip-title">{e.title}</span>
                      </button>
                    ))}
                    {list.length > CHIPS ? <button type="button" className="cal-more" onClick={() => onDay(k)}>{t("+{n} more", { n: list.length - CHIPS })}</button> : null}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
        {day ? (
          <section className="cal-day-list" aria-label={dayLabel(day, { weekday: "long", day: "numeric", month: "long" }, locale)}>
            <h3>{dayLabel(day, { weekday: "long", day: "numeric", month: "long" }, locale)}</h3>
            {picked.length ? picked.map((e) => <EventRow key={`${e.id}:${e.day}`} e={e} tz={tz} onOpen={onOpen} />) : <p className="cal-dim">{t("Nothing on this day yet.")}</p>}
          </section>
        ) : null}
      </div>
    </section>
  );
}

interface WeekProps {
  start: string; today: string; tz: string; events: Occurrence[]; canEdit: boolean;
  onAdd: (day: string) => void; onOpen: (e: Occurrence) => void; onMove: (n: number) => void; onToday: () => void;
}

/** Seven days from a Monday. On a phone, one day under the other. */
export function WeekView({ start, today, tz, events, canEdit, onAdd, onOpen, onMove, onToday }: WeekProps) {
  const { t, locale } = useCalLang();
  const days = useMemo(() => byDay(events), [events]);
  const keys = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const title = t("Week of {date}", { date: dayLabel(start, { day: "numeric", month: "long" }, locale) });
  return (
    <section className="cal-section" aria-labelledby="cal-h-week">
      <h2 id="cal-h-week">{t("Week")}</h2>
      <SectionBar title={title} prev={() => onMove(-7)} next={() => onMove(7)} nowLabel={t("This week")} onNow={onToday} prevLabel={t("Previous week")} nextLabel={t("Next week")} />
      <div className="cal-week">
        {keys.map((k) => {
          const list = days.get(k) ?? [];
          return (
            <div key={k} className={`cal-week-day${k === today ? " is-today" : ""}`}>
              <h3>{dayLabel(k, { weekday: "short", day: "numeric", month: "short" }, locale)}</h3>
              {list.length ? list.map((e) => <EventRow key={`${e.id}:${e.day}`} e={e} tz={tz} onOpen={onOpen} />) : <p className="cal-dim cal-small">{t("Nothing yet.")}</p>}
              {canEdit ? <button type="button" className="cal-quiet cal-add-day" onClick={() => onAdd(k)}>{t("+ Add on this day")}</button> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** The next weeks as a list, day by day, earliest first. */
export function AgendaView({ events, tz, onOpen, empty }: { events: Occurrence[]; tz: string; onOpen: (e: Occurrence) => void; empty: string }) {
  const { t, locale } = useCalLang();
  const days = useMemo(() => byDay(events), [events]);
  const keys = [...days.keys()];
  return (
    <section className="cal-section" aria-labelledby="cal-h-agenda">
      <h2 id="cal-h-agenda">{t("Agenda")}</h2>
      {keys.length ? (
        <div className="cal-agenda">
          {keys.map((k) => (
            <section key={k}>
              <h3>{dayLabel(k, { weekday: "long", day: "numeric", month: "long", year: "numeric" }, locale)}</h3>
              {days.get(k)!.map((e) => <EventRow key={`${e.id}:${e.day}`} e={e} tz={tz} onOpen={onOpen} />)}
            </section>
          ))}
        </div>
      ) : <p className="cal-empty">{empty}</p>}
    </section>
  );
}

