// The ways to browse a calendar: month, week, agenda (also used for search), discover and places. The events are already filtered and sorted.
import { useMemo, useState } from "react";
import { addDays, dayKey, dayLabel, monthCells, parseKey, timeOf } from "../../lib/calendarTime";
import { placesOf } from "../../lib/calendarFilter";
import { useCalLang } from "../../lib/calendarI18n";
import type { CalEvent } from "../../lib/calendarApi";

export function byDay(events: CalEvent[], tz: string): Map<string, CalEvent[]> {
  const m = new Map<string, CalEvent[]>();
  for (const e of events) {
    const k = dayKey(e.startsAt, tz);
    const list = m.get(k);
    if (list) list.push(e); else m.set(k, [e]);
  }
  return m;
}

function EventRow({ e, tz, onOpen }: { e: CalEvent; tz: string; onOpen: (e: CalEvent) => void }) {
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

export interface ViewProps { events: CalEvent[]; tz: string; onOpen: (e: CalEvent) => void }

/** Six Monday-first weeks. On a phone a day is a dot; tapping the day lists its events under the grid. */
export function MonthView({ cursor, events, tz, today, day, onDay, onOpen }: ViewProps & { cursor: string; today: string; day: string | null; onDay: (k: string) => void }) {
  const { t, locale } = useCalLang();
  const { y, m } = parseKey(cursor);
  const cells = useMemo(() => monthCells(y, m), [y, m]);
  const days = useMemo(() => byDay(events, tz), [events, tz]);
  const picked = day ? days.get(day) ?? [] : [];
  const clockOf = (e: CalEvent) => (e.allDay ? t("all day") : timeOf(e.startsAt, tz));
  return (
    <div className="cal-month">
      <div className="cal-month-head" aria-hidden="true">
        {cells.slice(0, 7).map((k) => <span key={k}>{dayLabel(k, { weekday: "short" }, locale)}</span>)}
      </div>
      <div className="cal-month-grid">
        {cells.map((k) => {
          const list = days.get(k) ?? [];
          const cls = ["cal-cell", k.slice(0, 7) !== cursor.slice(0, 7) ? "is-out" : "", k === today ? "is-today" : "", k === day ? "is-picked" : ""].join(" ");
          const full = dayLabel(k, { weekday: "long", day: "numeric", month: "long" }, locale);
          return (
            <div key={k} className={cls}>
              <button type="button" className="cal-daynum" onClick={() => onDay(k)} aria-label={`${full}, ${list.length === 1 ? t("1 event") : t("{n} events", { n: list.length })}`}>
                {Number(k.slice(8))}
              </button>
              <span className="cal-chips">
                {list.slice(0, 3).map((e) => <button key={e.id} type="button" className="cal-chip" onClick={() => onOpen(e)}>{clockOf(e)} {e.title}</button>)}
                {list.length > 3 ? <button type="button" className="cal-more" onClick={() => onDay(k)}>{t("+{n} more", { n: list.length - 3 })}</button> : null}
              </span>
              <span className="cal-dots" aria-hidden="true">{list.slice(0, 4).map((e) => <i key={e.id} />)}</span>
            </div>
          );
        })}
      </div>
      {day ? (
        <section className="cal-day-list" aria-label={dayLabel(day, { weekday: "long", day: "numeric", month: "long" }, locale)}>
          <h3>{dayLabel(day, { weekday: "long", day: "numeric", month: "long" }, locale)}</h3>
          {picked.length ? picked.map((e) => <EventRow key={e.id} e={e} tz={tz} onOpen={onOpen} />) : <p className="cal-dim">{t("Nothing on this day yet.")}</p>}
        </section>
      ) : null}
    </div>
  );
}

export function WeekView({ start, events, tz, today, canEdit, onAdd, onOpen }: ViewProps & { start: string; today: string; canEdit: boolean; onAdd: (day: string) => void }) {
  const { t, locale } = useCalLang();
  const days = useMemo(() => byDay(events, tz), [events, tz]);
  const keys = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  return (
    <div className="cal-week">
      {keys.map((k) => {
        const list = days.get(k) ?? [];
        return (
          <section key={k} className={`cal-week-day${k === today ? " is-today" : ""}`}>
            <h3>{dayLabel(k, { weekday: "short", day: "numeric", month: "short" }, locale)}</h3>
            {list.length ? list.map((e) => <EventRow key={e.id} e={e} tz={tz} onOpen={onOpen} />) : <p className="cal-dim">{t("Nothing yet.")}</p>}
            {canEdit ? <button type="button" className="cal-quiet" onClick={() => onAdd(k)}>{t("+ Add on this day")}</button> : null}
          </section>
        );
      })}
    </div>
  );
}

/** A list, day by day, earliest first. Also the search results. */
export function AgendaView({ events, tz, onOpen, empty }: ViewProps & { empty: string }) {
  const { locale } = useCalLang();
  const days = useMemo(() => byDay(events, tz), [events, tz]);
  const keys = [...days.keys()];
  if (!keys.length) return <p className="cal-empty">{empty}</p>;
  return (
    <div className="cal-agenda">
      {keys.map((k) => (
        <section key={k}>
          <h3>{dayLabel(k, { weekday: "long", day: "numeric", month: "long", year: "numeric" }, locale)}</h3>
          {days.get(k)!.map((e) => <EventRow key={e.id} e={e} tz={tz} onOpen={onOpen} />)}
        </section>
      ))}
    </div>
  );
}

/** A small seeded shuffle: the same seed gives the same order, so a render never reshuffles by itself. */
function shuffled<T>(items: T[], seed: number): T[] {
  const out = items.slice();
  let s = (seed * 2654435761) >>> 0;
  const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** Cards in a shuffled order: the way to find something you did not know you wanted. */
export function DiscoverView({ events, tz, onOpen }: ViewProps) {
  const { t, locale } = useCalLang();
  const [seed, setSeed] = useState(1);
  const cards = useMemo(() => shuffled(events, seed).slice(0, 24), [events, seed]);
  if (!events.length) return <p className="cal-empty">{t("Nothing coming up in the next 60 days yet.")}</p>;
  return (
    <div className="cal-discover">
      <button type="button" className="cal-quiet" onClick={() => setSeed((s) => s + 1)}>{t("Shuffle")}</button>
      <div className="cal-cards">
        {cards.map((e) => (
          <button key={e.id} type="button" className="cal-card" onClick={() => onOpen(e)}>
            {e.image ? <img src={e.image.url} alt="" loading="lazy" decoding="async" /> : <span className="cal-card-blank" aria-hidden="true">{e.title.slice(0, 1)}</span>}
            <strong>{e.title}</strong>
            <span className="cal-dim">{dayLabel(dayKey(e.startsAt, tz), { weekday: "short", day: "numeric", month: "short" }, locale)} · {e.allDay ? t("all day") : timeOf(e.startsAt, tz)}</span>
            {e.location ? <span className="cal-dim">{e.location}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PlacesView({ events, onPick }: { events: CalEvent[]; onPick: (place: string) => void }) {
  const { t } = useCalLang();
  const places = useMemo(() => placesOf(events), [events]);
  if (!places.length) return <p className="cal-empty">{t("No place is named in these events yet.")}</p>;
  return (
    <ul className="cal-places">
      {places.map((p) => (
        <li key={p.place}><button type="button" className="cal-place" onClick={() => onPick(p.place)}><span>{p.place}</span><span className="cal-dim">{p.count === 1 ? t("1 event") : t("{n} events", { n: p.count })}</span></button></li>
      ))}
    </ul>
  );
}
