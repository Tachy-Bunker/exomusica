// The calendar page (fix414): one page, stacked. Month, Week, Agenda and Places are sections under one search bar; no tabs.
// The server sends the events of a window; the page works out the days of the repeats and draws each section from that.
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../lib/api";
import { addDays, dayKey, dayStartIso, parseKey, todayKey, weekStart } from "../lib/calendarTime";
import { filterEvents } from "../lib/calendarFilter";
import { occurrencesIn, type Occurrence } from "../lib/calendarRepeat";
import { dropToken, enterCalendar, getCalendar, listEvents, messageOf, removeEvent, skipDay, type CalEvent, type CalView } from "../lib/calendarApi";
import { AgendaView, MonthView, WeekView } from "../components/calendar/CalendarViews";
import { EventComposer, type ComposeScope } from "../components/calendar/EventComposer";
import { EventSheet, type Scope } from "../components/calendar/EventSheet";
import { CalendarSettings } from "../components/calendar/CalendarSettings";
import { ShareDialog } from "../components/calendar/ShareDialog";
import { CalLangProvider, useCalLang, useCalLangState } from "../lib/calendarI18n";
import "../components/calendar/calendar.css";

// The map is only fetched when the Places section is there (Leaflet is about 40 KB; a phone that never opens it never loads it).
const PlacesSection = lazy(() => import("../components/calendar/PlacesSection"));

/** Renders its children once it is near the screen, and keeps them after. The map is fetched only then: a phone that never scrolls
 *  to Places never downloads it. Until then, a box of the map's size holds the place. */
function WhenNear({ children, height }: { children: ReactNode; height: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver((entries) => { if (entries.some((x) => x.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return <div ref={ref} style={seen ? undefined : { minHeight: height }}>{seen ? children : null}</div>;
}

/** The password from the link (after the #), or null when the link has none. */
function hashPassword(): string | null {
  const h = window.location.hash.replace(/^#/, "");
  if (!h) return null;
  try { return decodeURIComponent(h); } catch { return h; }
}
/** Takes the password out of the address bar, so it is not left on screen or copied by accident. */
const clearHash = (): void => history.replaceState(null, "", window.location.pathname + window.location.search);

/** The window the server is asked for: everything the month grid, the week, the agenda (60 days) and the places (120 days) show,
 *  or, while searching, a month back and a year ahead. */
function windowOf(today: string, monthCursor: string, weekCursor: string, searching: boolean, tz: string): [string, string] {
  if (searching) return [dayStartIso(addDays(today, -30), tz), dayStartIso(addDays(today, 395), tz)];
  const mFirst = weekStart(monthCursor.slice(0, 8) + "01");
  const mEnd = addDays(mFirst, 42);
  const wFirst = weekStart(weekCursor);
  const from = [today, mFirst, wFirst].sort()[0];
  const to = [addDays(today, 120), mEnd, addDays(wFirst, 7)].sort().reverse()[0];
  return [dayStartIso(from, tz), dayStartIso(to, tz)];
}
const shiftMonth = (key: string, n: number): string => { const { y, m } = parseKey(key); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10); };
// Errors are kept as the English sentence the server sends; they are shown in the calendar's language.
const fail = messageOf;

/** The language button: "Français" or "English". It rewrites the link's ?fr, so the choice can be shared. */
function LangToggle() {
  const { lang, setLang } = useCalLang();
  return <button type="button" className="cal-quiet cal-lang" onClick={() => setLang(lang === "fr" ? "en" : "fr")}>{lang === "fr" ? "English" : "Français"}</button>;
}

const LinkIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M10 13.5a4.5 4.5 0 0 0 6.36 0l3-3a4.5 4.5 0 0 0-6.36-6.36l-1.2 1.2M14 10.5a4.5 4.5 0 0 0-6.36 0l-3 3a4.5 4.5 0 0 0 6.36 6.36l1.2-1.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
  </svg>
);

export function CalendarPage() {
  const L = useCalLangState();
  return <CalLangProvider value={L}><CalendarView /></CalLangProvider>;
}

function CalendarView() {
  const { slug = "" } = useParams();
  const nav = useNavigate();
  const { t, lang } = useCalLang();
  const back = lang === "fr" ? "/calendar?fr" : "/calendar";
  const [cal, setCal] = useState<CalView | null>(null);
  const [editable, setEditable] = useState(false);     // may add, change and remove events here (from the server)
  const [missing, setMissing] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [today, setToday] = useState("");
  const [monthCursor, setMonthCursor] = useState("");
  const [weekCursor, setWeekCursor] = useState("");
  const [day, setDay] = useState<string | null>(null);
  const [raw, setRaw] = useState<CalEvent[]>([]);      // the events as the server sent them (a repeat once)
  const [win, setWin] = useState<[string, string] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [text, setText] = useState("");                 // the search box as typed
  const [q, setQ] = useState("");                       // the search, a moment after typing stops
  const [open, setOpen] = useState<Occurrence | null>(null);
  const [editing, setEditing] = useState<{ event?: CalEvent; scope?: ComposeScope; occurrenceDay?: string; day?: string } | null>(null);
  const [settings, setSettings] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [pass, setPass] = useState("");
  const [gateErr, setGateErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const searching = q.trim() !== "";

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
        setToday(k); setMonthCursor(k); setWeekCursor(k);
      } catch (x) {
        if (!alive) return;
        if (x instanceof ApiError && x.status === 404) setMissing(true);
        else setLoadErr(fail(x));
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  // The search, after a short pause.
  useEffect(() => { const t = setTimeout(() => setQ(text), 300); return () => clearTimeout(t); }, [text]);

  // The events of the window. Refreshed every minute while the page is visible, so guests see each other's additions.
  useEffect(() => {
    if (!cal || cal.locked || !today || !monthCursor) return;
    let alive = true;
    const [from, to] = windowOf(today, monthCursor, weekCursor, searching, cal.timezone);
    listEvents(cal.slug, { from, to, limit: 500 })
      .then((r) => { if (alive) { setRaw(r.events); setWin([from, to]); setTruncated(r.truncated); setEditable(r.canEdit); setLoadErr(""); } })
      .catch((x) => {
        if (!alive) return;
        if (x instanceof ApiError && x.status === 401) { dropToken(cal.slug); setEditable(false); setCal({ ...cal, locked: true }); }
        else setLoadErr(fail(x));
      });
    return () => { alive = false; };
  }, [cal, today, monthCursor, weekCursor, searching, tick]);
  useEffect(() => {
    if (!cal || cal.locked) return;
    const t = setInterval(() => { if (!document.hidden) setTick((n) => n + 1); }, 60_000);
    return () => clearInterval(t);
  }, [cal?.slug, cal?.locked]);

  // Repeats become their days inside the window; the search narrows them.
  const occ = useMemo(() => (win && cal ? occurrencesIn(raw, win[0], win[1], cal.timezone) : []), [raw, win, cal]);
  const shown = useMemo(() => filterEvents(occ, q), [occ, q]);
  const agendaTo = today ? addDays(today, 60) : "";
  const agenda = useMemo(() => (searching ? shown : shown.filter((e) => e.day >= today && e.day < agendaTo)), [shown, searching, today, agendaTo]);

  async function unlock(e: FormEvent) {
    e.preventDefault(); if (!cal) return;
    setBusy(true); setGateErr("");
    try { await enterCalendar(cal.slug, pass); const info = await getCalendar(cal.slug); setCal(info); setEditable(info.canEdit); setPass(""); }
    catch (x) { setGateErr(fail(x)); }
    finally { setBusy(false); }
  }
  function onSaved(saved: CalEvent | null) {
    setEditing(null);
    if (saved) { setOpen(null); setDay(dayKey(saved.startsAt, cal?.timezone ?? "UTC")); }
    setTick((n) => n + 1);
  }
  /** Edit or delete from the sheet. A repeat asks for the day or for the series; the master is the event the server holds. */
  function masterOf(e: Occurrence): CalEvent | undefined { return raw.find((r) => r.id === e.id); }
  function onEdit(scope: Scope) {
    if (!open) return;
    const master = masterOf(open);
    if (!master) return;
    setEditing(scope === "one" ? { event: master, scope: "one", occurrenceDay: open.day } : { event: master, scope: "all" });
    setOpen(null);
  }
  async function onDelete(scope: Scope) {
    if (!cal || !open) return;
    const master = masterOf(open);
    if (!master) return;
    if (scope === "one") {
      try { await skipDay(cal.slug, master.id, open.day, true); setOpen(null); setTick((n) => n + 1); }
      catch (x) { setLoadErr(fail(x)); }
      return;
    }
    const sure = master.recurrence ? t("Delete the whole series “{title}”?", { title: master.title }) : t("Delete “{title}”?", { title: master.title });
    if (!window.confirm(sure)) return;
    try { await removeEvent(cal.slug, master.id); setOpen(null); setTick((n) => n + 1); }
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

  return (
    <div className="cal-page">
      <header className="cal-head">
        <div className="cal-brand">
          <h1>{cal.name}</h1>
          <p className="cal-meta">
            <span>{cal.timezone}</span>
            <span aria-hidden="true">·</span>
            <span>{cal.protected ? t("with a password") : t("open")}</span>
            <button type="button" className="cal-icon" onClick={() => setSharing(true)} aria-label={t("Share this calendar")} title={t("Share this calendar")}><LinkIcon /></button>
            <LangToggle />
          </p>
          {!editable && cal.editMode === "members" ? <p className="cal-dim cal-small">{t("Read only for you: only its members change it.")}</p> : null}
        </div>
        <div className="cal-actions">
          {editable ? (
            <button type="button" className="cal-plus" onClick={() => setEditing({ day: day ?? today })} aria-label={t("Add an event")} title={t("Add an event")}>+</button>
          ) : null}
          {editable ? <button type="button" className="cal-quiet" aria-expanded={settings} onClick={() => setSettings((s) => !s)}>{t("Settings")}</button> : null}
          <Link className="cal-quiet" to={back}>{t("All calendars")}</Link>
        </div>
      </header>

      <div className="cal-search-row">
        <input type="search" className="cal-find" placeholder={t("Search the calendar…")} aria-label={t("Search the calendar")} value={text} onChange={(e) => setText(e.target.value)} />
      </div>

      {loadErr ? <p className="cal-err" role="alert">{t(loadErr)}</p> : null}
      {truncated ? <p className="cal-dim cal-small">{t("Only the first events in this stretch are shown; narrow it with the search.")}</p> : null}
      {settings && editable ? <CalendarSettings cal={cal} onChanged={(c) => { setCal(c); setEditable(c.canEdit); }} onGone={() => nav(back)} /> : null}

      <main className="cal-main">
        {monthCursor ? (
          <MonthView cursor={monthCursor} today={today} day={day} tz={cal.timezone} events={shown}
            onDay={(k) => setDay(k === day ? null : k)} onOpen={setOpen}
            onMove={(n) => setMonthCursor(shiftMonth(monthCursor, n))} onToday={() => { setMonthCursor(today); setWeekCursor(today); setDay(today); }} />
        ) : null}
        {weekCursor ? (
          <WeekView start={weekStart(weekCursor)} today={today} tz={cal.timezone} events={shown} canEdit={editable}
            onAdd={(d) => setEditing({ day: d })} onOpen={setOpen}
            onMove={(n) => setWeekCursor(addDays(weekCursor, n))} onToday={() => setWeekCursor(today)} />
        ) : null}
        <AgendaView events={agenda} tz={cal.timezone} onOpen={setOpen}
          empty={searching ? t("Nothing matches that.") : t("Nothing in the next 60 days yet.")} />
        <WhenNear height="min(420px, 60vh)">
          <Suspense fallback={<p className="cal-dim">{t("Loading…")}</p>}>
            <PlacesSection slug={cal.slug} tz={cal.timezone} events={shown} onOpen={setOpen} />
          </Suspense>
        </WhenNear>
      </main>

      {open ? (
        <EventSheet e={open} tz={cal.timezone} canEdit={editable} onClose={() => setOpen(null)}
          onEdit={onEdit} onDelete={(scope) => void onDelete(scope)} />
      ) : null}
      {editing && editable ? (
        <div className="cal-sheet-back" onClick={() => setEditing(null)}>
          <div className="cal-sheet cal-sheet-form" role="dialog" aria-modal="true" aria-label={t("Event")} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="cal-sheet-x" onClick={() => setEditing(null)} aria-label={t("Close")}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" /></svg>
            </button>
            <EventComposer key={`${editing.event?.id ?? "new"}:${editing.scope ?? ""}:${editing.occurrenceDay ?? editing.day ?? ""}`} slug={cal.slug} tz={cal.timezone}
              event={editing.event} scope={editing.scope} occurrenceDay={editing.occurrenceDay} day={editing.day}
              onDone={onSaved} onRefresh={() => setTick((n) => n + 1)} />
          </div>
        </div>
      ) : null}
      {sharing ? <ShareDialog slug={cal.slug} name={cal.name} protectedCal={cal.protected} onClose={() => setSharing(false)} /> : null}
    </div>
  );
}

