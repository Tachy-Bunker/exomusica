// The calendar page: its events in six ways, the form to add and change them, the settings, and the password gate.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../lib/api";
import { addDays, dayKey, dayLabel, dayStartIso, parseKey, todayKey, weekStart } from "../lib/calendarTime";
import { EMPTY_FILTER, filterEvents, placesOf, type Filter } from "../lib/calendarFilter";
import { dropToken, enterCalendar, getCalendar, listEvents, messageOf, removeEvent, type CalEvent, type CalView } from "../lib/calendarApi";
import { AgendaView, DiscoverView, MonthView, PlacesView, WeekView } from "../components/calendar/CalendarViews";
import { EventComposer } from "../components/calendar/EventComposer";
import { EventSheet } from "../components/calendar/EventSheet";
import { CalendarSettings } from "../components/calendar/CalendarSettings";
import { CalLangProvider, useCalLang, useCalLangState } from "../lib/calendarI18n";
import "../components/calendar/calendar.css";

type View = "month" | "week" | "agenda" | "discover" | "places" | "search";
const VIEWS: [View, string][] = [["month", "Month"], ["week", "Week"], ["agenda", "Agenda"], ["discover", "Discover"], ["places", "Places"], ["search", "Search"]];
const VIEW_KEY = "exomusica_calendar_view";
const readView = (): View => { try { const v = localStorage.getItem(VIEW_KEY) as View | null; return VIEWS.some(([k]) => k === v) ? (v as View) : "month"; } catch { return "month"; } };
const writeView = (v: View): void => { try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage blocked: the view resets */ } };

/** The password from the link (after the #), or null when the link has none. */
function hashPassword(): string | null {
  const h = window.location.hash.replace(/^#/, "");
  if (!h) return null;
  try { return decodeURIComponent(h); } catch { return h; }
}
/** Takes the password out of the address bar, so it is not left on screen or copied by accident. */
const clearHash = (): void => history.replaceState(null, "", window.location.pathname + window.location.search);

/** The window of days a view loads. Month: its six weeks. Search: a month back and a year ahead. The rest: the next 60 days. */
function rangeOf(view: View, cursor: string, today: string, tz: string): [string, string] {
  let from: string, days: number;
  if (view === "month") { from = weekStart(cursor.slice(0, 8) + "01"); days = 42; }
  else if (view === "week") { from = weekStart(cursor); days = 7; }
  else if (view === "search") { from = addDays(today, -30); days = 395; }
  else { from = today; days = view === "places" ? 120 : 60; }
  return [dayStartIso(from, tz), dayStartIso(addDays(from, days), tz)];
}
const shiftMonth = (key: string, n: number): string => { const { y, m } = parseKey(key); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10); };
// Errors are kept as the English sentence the server sends; they are shown in the calendar's language.
const fail = messageOf;

/** The language button: "Français" or "English". It rewrites the link's ?fr, so the choice can be shared. */
function LangToggle() {
  const { lang, setLang } = useCalLang();
  return <button type="button" className="cal-quiet" onClick={() => setLang(lang === "fr" ? "en" : "fr")}>{lang === "fr" ? "English" : "Français"}</button>;
}

export function CalendarPage() {
  const L = useCalLangState();
  return <CalLangProvider value={L}><CalendarView /></CalLangProvider>;
}

function CalendarView() {
  const { slug = "" } = useParams();
  const nav = useNavigate();
  const { t, locale, lang } = useCalLang();
  const back = lang === "fr" ? "/calendar?fr" : "/calendar";
  const [cal, setCal] = useState<CalView | null>(null);
  const [editable, setEditable] = useState(false);     // may add, change and remove events here (from the server)
  const [missing, setMissing] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [view, setView] = useState<View>(readView);
  const [today, setToday] = useState("");
  const [cursor, setCursor] = useState("");
  const [day, setDay] = useState<string | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);
  const [q, setQ] = useState("");                       // the server search, a moment after typing stops
  const [open, setOpen] = useState<CalEvent | null>(null);
  const [editing, setEditing] = useState<{ event?: CalEvent; day?: string } | null>(null);
  const [settings, setSettings] = useState(false);
  const [pass, setPass] = useState("");
  const [gateErr, setGateErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  // The calendar itself. A password in the link is used once, then the address bar is cleaned.
  useEffect(() => {
    let alive = true;
    setMissing(false); setCal(null); setLoadErr("");
    (async () => {
      try {
        let info = await getCalendar(slug);
        const pw = hashPassword();
        if (pw !== null) {
          clearHash();
          if (info.locked) {
            try { await enterCalendar(slug, pw); info = await getCalendar(slug); }
            catch { if (alive) setGateErr("That password does not open this calendar."); }
          }
        }
        if (!alive) return;
        if (info.locked) dropToken(slug);            // an old token no longer works: ask again
        setCal(info); setEditable(info.canEdit);
        const k = todayKey(info.timezone);
        setToday(k); setCursor(k);
      } catch (x) {
        if (!alive) return;
        if (x instanceof ApiError && x.status === 404) setMissing(true);
        else setLoadErr(fail(x));
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  // The page's own search box, after a short pause.
  useEffect(() => { const t = setTimeout(() => setQ(filter.q.trim()), 300); return () => clearTimeout(t); }, [filter.q]);

  // The events of the view. Refreshed every minute while the page is visible, so guests see each other's additions.
  useEffect(() => {
    if (!cal || cal.locked || !cursor) return;
    let alive = true;
    const [from, to] = rangeOf(view, cursor, today, cal.timezone);
    listEvents(cal.slug, { from, to, q: view === "search" && q ? q : undefined })
      .then((r) => { if (alive) { setEvents(r.events); setTruncated(r.truncated); setEditable(r.canEdit); setLoadErr(""); } })
      .catch((x) => {
        if (!alive) return;
        if (x instanceof ApiError && x.status === 401) { dropToken(cal.slug); setEditable(false); setCal({ ...cal, locked: true }); }
        else setLoadErr(fail(x));
      });
    return () => { alive = false; };
  }, [cal, view, cursor, today, q, tick]);
  useEffect(() => {
    if (!cal || cal.locked) return;
    const t = setInterval(() => { if (!document.hidden) setTick((n) => n + 1); }, 60_000);
    return () => clearInterval(t);
  }, [cal?.slug, cal?.locked]);

  const shown = useMemo(() => filterEvents(events, filter), [events, filter]);
  const places = useMemo(() => placesOf(events), [events]);

  function changeView(v: View) { setView(v); writeView(v); }
  async function unlock(e: FormEvent) {
    e.preventDefault(); if (!cal) return;
    setBusy(true); setGateErr("");
    try { await enterCalendar(cal.slug, pass); const info = await getCalendar(cal.slug); setCal(info); setEditable(info.canEdit); setPass(""); }
    catch (x) { setGateErr(fail(x)); }
    finally { setBusy(false); }
  }
  function onSaved(saved: CalEvent | null) {
    setEditing(null);
    if (saved) { setOpen(null); setDay(dayKey(saved.startsAt, cal?.timezone ?? "UTC")); setTick((n) => n + 1); }
  }
  async function onDelete(e: CalEvent) {
    if (!cal || !window.confirm(t("Delete “{title}”?", { title: e.title }))) return;
    try { await removeEvent(cal.slug, e.id); setOpen(null); setTick((n) => n + 1); }
    catch (x) { setLoadErr(fail(x)); }
  }

  if (missing) return <div className="cal-page"><p className="cal-empty">{t("There is no calendar at this address.")} <Link to={back}>{t("See the open calendars")}</Link>.</p></div>;
  if (!cal) return <div className="cal-page"><p className="cal-dim">{t(loadErr || "Loading…")}</p></div>;

  if (cal.locked) {
    return (
      <div className="cal-page">
        <form className="cal-gate" onSubmit={unlock}>
          <h1>{cal.name}</h1>
          <p className="cal-dim">{t("This calendar has a password. The link you were given carries it after the #; or type it here.")}</p>
          <label>{t("Password")}<input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" autoFocus required /></label>
          {gateErr ? <p className="cal-err" role="alert">{t(gateErr)}</p> : null}
          <div className="cal-actions">
            <button type="submit" className="cal-primary" disabled={busy}>{busy ? "…" : t("Open")}</button>
            <LangToggle />
          </div>
        </form>
      </div>
    );
  }

  const monthTitle = dayLabel(cursor, { month: "long", year: "numeric" }, locale);
  const weekTitle = dayLabel(weekStart(cursor), { day: "numeric", month: "long" }, locale);
  return (
    <div className="cal-page">
      <header className="cal-head">
        <div>
          <h1>{cal.name}</h1>
          <p className="cal-dim">{cal.timezone} · {cal.protected ? t("with a password") : t("open")}</p>
          {!editable && cal.editMode === "members" ? <p className="cal-dim cal-small">{t("Read only for you: only its members change it.")}</p> : null}
        </div>
        <div className="cal-actions">
          {editable ? <button type="button" className="cal-primary" onClick={() => setEditing({ day: day ?? today })}>{t("Add event")}</button> : null}
          {editable ? <button type="button" className="cal-quiet" aria-expanded={settings} onClick={() => setSettings((s) => !s)}>{t("Settings")}</button> : null}
          <LangToggle />
          <Link className="cal-quiet" to={back}>{t("All calendars")}</Link>
        </div>
      </header>

      <nav className="cal-views" role="tablist" aria-label={t("How to browse")}>
        {VIEWS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? "is-on" : ""} onClick={() => changeView(k)}>{t(label)}</button>
        ))}
      </nav>

      <div className="cal-bar">
        {view === "month" ? (
          <>
            <button type="button" className="cal-quiet" aria-label={t("Previous month")} onClick={() => setCursor(shiftMonth(cursor, -1))}>‹</button>
            <strong className="cal-title">{monthTitle}</strong>
            <button type="button" className="cal-quiet" aria-label={t("Next month")} onClick={() => setCursor(shiftMonth(cursor, 1))}>›</button>
            <button type="button" className="cal-quiet" onClick={() => { setCursor(today); setDay(today); }}>{t("Today")}</button>
          </>
        ) : null}
        {view === "week" ? (
          <>
            <button type="button" className="cal-quiet" aria-label={t("Previous week")} onClick={() => setCursor(addDays(cursor, -7))}>‹</button>
            <strong className="cal-title">{t("Week of {date}", { date: weekTitle })}</strong>
            <button type="button" className="cal-quiet" aria-label={t("Next week")} onClick={() => setCursor(addDays(cursor, 7))}>›</button>
            <button type="button" className="cal-quiet" onClick={() => setCursor(today)}>{t("This week")}</button>
          </>
        ) : null}
        <input type="search" className="cal-find" placeholder={t("Find a word…")} aria-label={t("Find in this calendar")} value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
        <select aria-label={t("Place")} value={filter.place} onChange={(e) => setFilter({ ...filter, place: e.target.value })}>
          <option value="">{t("All places")}</option>
          {places.map((p) => <option key={p.place} value={p.place}>{p.place} ({p.count})</option>)}
        </select>
        <label className="cal-check"><input type="checkbox" checked={filter.withPicture} onChange={(e) => setFilter({ ...filter, withPicture: e.target.checked })} /> {t("With a picture")}</label>
      </div>

      {loadErr ? <p className="cal-err" role="alert">{t(loadErr)}</p> : null}
      {truncated ? <p className="cal-dim cal-small">{t("Only the first events in this stretch are shown; narrow it with Find.")}</p> : null}
      {settings && editable ? <CalendarSettings cal={cal} onChanged={(c) => { setCal(c); setEditable(c.canEdit); }} onGone={() => nav(back)} /> : null}

      <main className="cal-main">
        {view === "month" ? <MonthView cursor={cursor} events={shown} tz={cal.timezone} today={today} day={day} onDay={setDay} onOpen={setOpen} /> : null}
        {view === "week" ? <WeekView start={weekStart(cursor)} events={shown} tz={cal.timezone} today={today} canEdit={editable} onAdd={(d) => setEditing({ day: d })} onOpen={setOpen} /> : null}
        {view === "agenda" ? <AgendaView events={shown} tz={cal.timezone} empty={t("Nothing in the next 60 days yet.")} onOpen={setOpen} /> : null}
        {view === "discover" ? <DiscoverView events={shown} tz={cal.timezone} onOpen={setOpen} /> : null}
        {view === "places" ? <PlacesView events={shown} onPick={(p) => { setFilter({ ...filter, place: p }); changeView("agenda"); }} /> : null}
        {view === "search" ? <AgendaView events={shown} tz={cal.timezone} empty={q ? t("Nothing matches that.") : t("Type a word in Find to search the whole calendar.")} onOpen={setOpen} /> : null}
      </main>

      {open ? <EventSheet e={open} tz={cal.timezone} canEdit={editable} onClose={() => setOpen(null)} onEdit={() => { setEditing({ event: open }); setOpen(null); }} onDelete={() => void onDelete(open)} /> : null}
      {editing && editable ? (
        <div className="cal-sheet-back" onClick={() => setEditing(null)}>
          <div className="cal-sheet cal-sheet-form" role="dialog" aria-modal="true" aria-label={t("Event")} onClick={(e) => e.stopPropagation()}>
            <EventComposer key={editing.event?.id ?? editing.day ?? "new"} slug={cal.slug} tz={cal.timezone} event={editing.event} day={editing.day} onDone={onSaved} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
