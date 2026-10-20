// The calendar's sections, stacked: Month, then Agenda. Each gets the events already expanded (repeats included) and already searched,
// and draws them; the page loads and filters. The Places section is its own file (lazy: the map loads only when it is reached).
// fix416: a repeat fades as its dates get further from today (the echo view), and the agenda can also read as one sentence a day.
import { useMemo, useState } from "react";
import { dayLabel, monthCells, parseKey, timeOf } from "../../lib/calendarTime";
import { useCalLang } from "../../lib/calendarI18n";
import type { Occurrence } from "../../lib/calendarRepeat";
import type { AgendaChoice } from "../../lib/calendarAgenda";
import { echoOpacity } from "../../lib/calendarEcho";
import "./calendarViz.css";

/** The events grouped by their day, in the order they came. */
export function byDay(events: Occurrence[]): Map<string, Occurrence[]> {
  const m = new Map<string, Occurrence[]>();
  for (const e of events) {
    const list = m.get(e.day);
    if (list) list.push(e); else m.set(e.day, [e]);
  }
  return m;
}

function EventRow({ e, tz, onOpen, fade }: { e: Occurrence; tz: string; onOpen: (e: Occurrence) => void; fade: number }) {
  const { t } = useCalLang();
  const clock = e.allDay ? t("all day") : timeOf(e.startsAt, tz);
  return (
    <button type="button" className="cal-row" onClick={() => onOpen(e)} style={{ opacity: fade }}>
      {e.image ? <img className="cal-thumb" src={e.image.url} alt="" loading="lazy" decoding="async" /> : null}
      <span className="cal-row-main">
        <span className="cal-row-title">{e.title}</span>
        <span className="cal-dim">{clock}{e.location ? ` · ${e.location}` : ""}</span>
      </span>
    </button>
  );
}

/** A section's heading row: the title in the middle, the buttons either side. */
function SectionBar({ title, prev, next, nowLabel, onNow, prevLabel, nextLabel }: {
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

/** Six Monday-first weeks. An empty day is a small number; a day with events is filled, with its count. Today is a filled circle.
 *  On a phone the titles hide and the count stays; tapping a day lists its events under the grid. */
export function MonthView({ cursor, today, day, tz, events, onDay, onOpen, onMove, onToday }: MonthProps) {
  const { t, locale } = useCalLang();
  const { y, m } = parseKey(cursor);
  const cells = useMemo(() => monthCells(y, m), [y, m]);
  const days = useMemo(() => byDay(events), [events]);
  const echo = useMemo(() => echoOpacity(events, today), [events, today]);
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
                      <button key={`${e.id}:${e.day}:${i}`} type="button" className="cal-chip" title={`${clockOf(e)} ${e.title}`} onClick={() => onOpen(e)}
                        style={{ opacity: echo.get(`${e.id}:${e.day}`) ?? 1 }}>
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
            {picked.length ? picked.map((e) => <EventRow key={`${e.id}:${e.day}`} e={e} tz={tz} onOpen={onOpen} fade={echo.get(`${e.id}:${e.day}`) ?? 1} />) : <p className="cal-dim">{t("Nothing on this day yet.")}</p>}
          </section>
        ) : null}
      </div>
    </section>
  );
}

/** The agenda's periods. The number box takes over when a number is typed. */
const PERIODS: { key: AgendaChoice; label: string }[] = [
  { key: "30", label: "Next 30 days" },
  { key: "week", label: "This week" },
  { key: "next", label: "Next week" },
];

interface AgendaProps {
  events: Occurrence[]; tz: string; today: string; empty: string; range: string;
  active: AgendaChoice | "custom"; custom: string;
  onPick: (c: AgendaChoice) => void; onCustom: (text: string) => void; onOpen: (e: Occurrence) => void;
}

/** The days as a list, earliest first, or as one sentence a day. 30 days unless another period is picked or a number of days is typed. */
export function AgendaView({ events, tz, today, empty, range, active, custom, onPick, onCustom, onOpen }: AgendaProps) {
  const { t, locale } = useCalLang();
  const [mode, setMode] = useState<"list" | "sentences">("list");
  const days = useMemo(() => byDay(events), [events]);
  const echo = useMemo(() => echoOpacity(events, today), [events, today]);
  const keys = [...days.keys()];
  const sentence = (k: string): string => {
    const items = days.get(k)!.map((e) => {
      const head = e.allDay ? t("{title}, all day", { title: e.title }) : t("{title} at {clock}", { title: e.title, clock: timeOf(e.startsAt, tz) });
      return e.location ? `${head}, ${e.location}` : head;
    });
    return t("{day}: {items}.", { day: dayLabel(k, { weekday: "long", day: "numeric", month: "long" }, locale), items: items.join("; ") });
  };
  return (
    <section className="cal-section" aria-labelledby="cal-h-agenda">
      <h2 id="cal-h-agenda">{t("Agenda")}</h2>
      <div className="cal-periods">
        {PERIODS.map((p) => (
          <button key={p.key} type="button" className="cal-period" aria-pressed={active === p.key} onClick={() => onPick(p.key)}>{t(p.label)}</button>
        ))}
        <label className="cal-days-input">
          <span>{t("Or number of days")}</span>
          <input type="number" inputMode="numeric" min={1} max={366} step={1} placeholder="30" value={custom} onChange={(e) => onCustom(e.target.value)} />
        </label>
      </div>
      <div className="cal-periods cal-show" role="group" aria-label={t("Show as")}>
        <button type="button" className="cal-period" aria-pressed={mode === "list"} onClick={() => setMode("list")}>{t("List")}</button>
        <button type="button" className="cal-period" aria-pressed={mode === "sentences"} onClick={() => setMode("sentences")}>{t("Sentences")}</button>
      </div>
      <p className="cal-dim cal-small">{range}</p>
      {keys.length ? (
        mode === "sentences" ? (
          <div className="cal-sentences">
            {keys.map((k) => <p key={k}>{sentence(k)}</p>)}
          </div>
        ) : (
          <div className="cal-agenda">
            {keys.map((k) => (
              <section key={k}>
                <h3>{dayLabel(k, { weekday: "long", day: "numeric", month: "long", year: "numeric" }, locale)}</h3>
                {days.get(k)!.map((e) => <EventRow key={`${e.id}:${e.day}`} e={e} tz={tz} onOpen={onOpen} fade={echo.get(`${e.id}:${e.day}`) ?? 1} />)}
              </section>
            ))}
          </div>
        )
      ) : <p className="cal-empty">{empty}</p>}
    </section>
  );
}
