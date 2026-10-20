// The calendar page (fix415): one page, stacked. Month and Agenda are sections under one search bar, then Places; no tabs, no week.
// The server sends the events of a window; the page works out the days of the repeats and draws each section from that.
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../lib/api";
import { addDays, dayKey, dayLabel, dayStartIso, parseKey, todayKey, weekStart } from "../lib/calendarTime";
import { searchEvents } from "../lib/calendarSearch";
import { memoryOf, tonightOf, venuesOf } from "../lib/calendarToday";
import { dayStepOf, isTyping } from "../lib/calendarKeys";
import { readViewPrefs, writeViewPrefs, type AgendaMode } from "../lib/calendarView";
import { agendaSpan, customDays, type AgendaChoice } from "../lib/calendarAgenda";
import { downloadIcs, icsName, icsOf } from "../lib/calendarIcs";
import { occurrencesIn, type Occurrence } from "../lib/calendarRepeat";
import { dropToken, enterCalendar, getCalendar, listEvents, listTape, messageOf, removeEvent, skipDay, type CalEvent, type CalView, type TapeChange } from "../lib/calendarApi";
import { AgendaView, MonthView } from "../components/calendar/CalendarViews";
import { ChangeTape } from "../components/calendar/ChangeTape";
import { TonightStrip } from "../components/calendar/TonightStrip";
import { VenueIndex } from "../components/calendar/VenueIndex";
import { EventComposer, type ComposeScope } from "../components/calendar/EventComposer";
import { EventSheet, type Scope } from "../components/calendar/EventSheet";
import { CalendarSettings } from "../components/calendar/CalendarSettings";
import { ShareDialog } from "../components/calendar/ShareDialog";
import { CogIcon, FlagFR, FlagGB, LinkIcon } from "../components/calendar/Icons";
import { CalLangProvider, useCalLang, useCalLangState } from "../lib/calendarI18n";
import "../components/calendar/calendar.css";

// The map is only fetched when the Places section is reached (Leaflet is about 40 KB; a phone that never gets there never loads it).
const PlacesSection = lazy(() => import("../components/calendar/PlacesSection"));

/** Renders its children once it is near the screen, and keeps them after. Until then, a box of the map's size holds the place. */
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

/** The window the server is asked for: everything the month grid and the agenda's days show, and the places (120 days); or, while
 *  searching, a month back and a year ahead. */
function windowOf(today: string, monthCursor: string, agenda: [string, string], searching: boolean, tz: string): [string, string] {
  if (searching) return [dayStartIso(addDays(today, -30), tz), dayStartIso(addDays(today, 395), tz)];
  const mFirst = weekStart(monthCursor.slice(0, 8) + "01");
  const mEnd = addDays(mFirst, 42);
  const from = [today, mFirst, agenda[0]].sort()[0];
  const to = [addDays(today, 120), mEnd, agenda[1]].sort().reverse()[0];
  return [dayStartIso(from, tz), dayStartIso(to, tz)];
}
const shiftMonth = (key: string, n: number): string => { const { y, m } = parseKey(key); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10); };
// Errors are kept as the English sentence the server sends; they are shown in the calendar's language.
const fail = messageOf;

/** The language button: the two flags, the one in use lit. A click switches, and the link is rewritten (?fr), so the choice can be shared. */
function LangToggle() {
  const { lang, setLang, t } = useCalLang();
  const next = lang === "fr" ? "en" : "fr";
  const label = next === "fr" ? t("Switch to French") : t("Switch to English");
  return (
    <button type="button" className="cal-lang" onClick={() => setLang(next)} aria-label={label} title={label}>
      <FlagGB on={lang === "en"} />
      <FlagFR on={lang === "fr"} />
    </button>
  );
}

export function CalendarPage() {
  const L = useCalLangState();
  const { slug = "" } = useParams();
  // Keyed by the calendar: moving to another one starts its page fresh, with its own remembered view.
  return <CalLangProvider value={L}><CalendarView key={slug} /></CalLangProvider>;
}

function CalendarView() {
  const { slug = "" } = useParams();
  const nav = useNavigate();
  const { t, lang, locale } = useCalLang();
  const back = lang === "fr" ? "/calendar?fr" : "/calendar";
  const [cal, setCal] = useState<CalView | null>(null);
  const [editable, setEditable] = useState(false);     // may add, change and remove events here (from the server)
  const [missing, setMissing] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [today, setToday] = useState("");
  const [monthCursor, setMonthCursor] = useState("");
  const [day, setDay] = useState<string | null>(null);
  const [raw, setRaw] = useState<CalEvent[]>([]);      // the events as the server sent them (a repeat once)
  const [win, setWin] = useState<[string, string] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [text, setText] = useState("");                 // the search box as typed
  const [q, setQ] = useState("");                       // the search, a moment after typing stops
  // The agenda's view, as this browser last left it for this calendar (idea 7): the period, a number of days typed in, list or sentences.
  const [prefs] = useState(() => readViewPrefs(slug));
  const [agendaChoice, setAgendaChoice] = useState<AgendaChoice>(prefs.period);
  const [agendaCustom, setAgendaCustom] = useState(prefs.custom); // a number of days typed in; it takes over the period
  const [mode, setMode] = useState<AgendaMode>(prefs.mode);
  useEffect(() => { writeViewPrefs(slug, { period: agendaChoice, custom: agendaCustom, mode }); }, [slug, agendaChoice, agendaCustom, mode]);
  const [open, setOpen] = useState<Occurrence | null>(null);
  const [editing, setEditing] = useState<{ event?: CalEvent; scope?: ComposeScope; occurrenceDay?: string; day?: string } | null>(null);
  const [settings, setSettings] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [pass, setPass] = useState("");
  const [gateErr, setGateErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [tape, setTape] = useState<TapeChange[]>([]);   // the change tape: the latest changes, newest first
  const searchRef = useRef<HTMLInputElement | null>(null);
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
        setToday(todayKey(info.timezone)); setMonthCursor(todayKey(info.timezone));
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

  // The agenda's days: 30 by default, this week, next week, or the number typed in.
  const agendaRange = useMemo<[string, string]>(() => (today ? agendaSpan(today, agendaChoice, agendaCustom) : ["", ""]), [today, agendaChoice, agendaCustom]);
  const agendaActive: AgendaChoice | "custom" = customDays(agendaCustom) !== null ? "custom" : agendaChoice;

  // The events of the window. Refreshed every minute while the page is visible, so guests see each other's additions.
  useEffect(() => {
    if (!cal || cal.locked || !today || !monthCursor) return;
    let alive = true;
    const [from, to] = windowOf(today, monthCursor, agendaRange, searching, cal.timezone);
    listEvents(cal.slug, { from, to, limit: 500 })
      .then((r) => { if (alive) { setRaw(r.events); setWin([from, to]); setTruncated(r.truncated); setEditable(r.canEdit); setLoadErr(""); } })
      .catch((x) => {
        if (!alive) return;
        if (x instanceof ApiError && x.status === 401) { dropToken(cal.slug); setEditable(false); setCal({ ...cal, locked: true }); }
        else setLoadErr(fail(x));
      });
    return () => { alive = false; };
  }, [cal, today, monthCursor, agendaRange, searching, tick]);
  useEffect(() => {
    if (!cal || cal.locked) return;
    const t = setInterval(() => { if (!document.hidden) setTick((n) => n + 1); }, 60_000);
    return () => clearInterval(t);
  }, [cal?.slug, cal?.locked]);

  // The change tape: read with the events (every minute, and after each change made here).
  useEffect(() => {
    if (!cal || cal.locked) return;
    let alive = true;
    listTape(cal.slug).then((r) => { if (alive) setTape(Array.isArray(r?.changes) ? r.changes : []); }).catch(() => { /* the tape is an extra: the page works without it */ });
    return () => { alive = false; };
  }, [cal, tick]);

  // Repeats become their days inside the window; the search narrows them.
  const occ = useMemo(() => (win && cal ? occurrencesIn(raw, win[0], win[1], cal.timezone) : []), [raw, win, cal]);
  const shown = useMemo(() => searchEvents(occ, q, today), [occ, q, today]);
  // Today, marked against the clock (idea 1): redone when the window changes and each minute with the tick.
  const tonight = useMemo(() => (today ? tonightOf(occ, today, Date.now()) : null), [occ, today, tick]);
  // The places still to come (idea 4). The search narrows them, so a search shows only its places.
  const venues = useMemo(() => venuesOf(shown, today), [shown, today]);
  // The places the calendar knows, from the events on the page (idea 15): the form fills a typed one from them.
  const memory = useMemo(() => (cal ? memoryOf(raw, cal.timezone) : []), [raw, cal]);
  // The keyboard (idea 8): "/" focuses the search; the left and right arrows walk the picked day by one, the up and down by a week;
  // Enter opens the first event of the picked day. A typed field keeps its keys, the map keeps its arrows, and an open sheet, form or
  // share dialog keeps everything.
  useEffect(() => {
    if (!cal || cal.locked || !today) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || open || editing || sharing) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.(".leaflet-container")) return;
      if (e.key === "/" && !isTyping(el)) { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); return; }
      if (isTyping(el)) return;
      const step = dayStepOf(e.key);
      if (step !== null) {
        e.preventDefault();
        const next = addDays(day ?? today, step);
        setDay(next);
        if (next.slice(0, 7) !== monthCursor.slice(0, 7)) setMonthCursor(next);
        return;
      }
      // A button or link keeps its own Enter (it presses itself); the page takes the Enter everywhere else.
      if (e.key === "Enter" && !(el && (el.tagName === "BUTTON" || el.tagName === "A"))) {
        const first = shown.find((x) => x.day === (day ?? today));
        if (first) { e.preventDefault(); setOpen(first); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cal, today, day, monthCursor, shown, open, editing, sharing]);
  const agenda = useMemo(() => (searching ? shown : shown.filter((e) => e.day >= agendaRange[0] && e.day < agendaRange[1])), [shown, searching, agendaRange]);
  const rangeText = today
    ? `${dayLabel(agendaRange[0], { day: "numeric", month: "short" }, locale)} – ${dayLabel(addDays(agendaRange[1], -1), { day: "numeric", month: "short", year: "numeric" }, locale)}`
    : "";

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
  /** Downloads the event as a calendar file. A repeat comes as its whole series, with its last day and the days left out. */
  function addToCalendar(e: Occurrence) {
    if (!cal) return;
    const master = masterOf(e);
    if (!master) return;
    const host = window.location.hostname || "exomusica";
    downloadIcs(icsName(master), icsOf(master, cal.timezone, { uid: `${master.id}.${cal.slug}@${host}` }));
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
          {!editable && cal.editMode === "members" ? <p className="cal-dim cal-small">{t("Read only for you: only its members change it.")}</p> : null}
        </div>
        <div className="cal-actions">
          {editable ? (
            <button type="button" className="cal-plus" onClick={() => setEditing({ day: day ?? today })} aria-label={t("Add an event")} title={t("Add an event")}>+</button>
          ) : null}
          {editable ? (
            <button type="button" className="cal-icon" aria-expanded={settings} aria-label={t("Settings")} title={t("Settings")} onClick={() => setSettings((s) => !s)}><CogIcon /></button>
          ) : null}
          <button type="button" className="cal-icon" onClick={() => setSharing(true)} aria-label={t("Share this calendar")} title={t("Share this calendar")}><LinkIcon size={36} /></button>
          <LangToggle />
          <Link className="cal-quiet" to={back}>{t("All calendars")}</Link>
        </div>
      </header>

      {tonight ? <TonightStrip tonight={tonight} tz={cal.timezone} onOpen={setOpen} /> : null}

      <div className="cal-search-row">
        <input ref={searchRef} type="search" className="cal-find" placeholder={t("Search the calendar…")} aria-label={t("Search the calendar")} value={text} onChange={(e) => setText(e.target.value)}
          title={t("Press / to search. Arrows walk the days, Enter opens the day's first event.")} />
      </div>

      {loadErr ? <p className="cal-err" role="alert">{t(loadErr)}</p> : null}
      {truncated ? <p className="cal-dim cal-small">{t("Only the first events in this stretch are shown; narrow it with the search.")}</p> : null}
      {settings && editable ? <CalendarSettings cal={cal} onChanged={(c) => { setCal(c); setEditable(c.canEdit); }} onGone={() => nav(back)} /> : null}

      <main className="cal-main">
        {monthCursor ? (
          <MonthView cursor={monthCursor} today={today} day={day} tz={cal.timezone} events={shown}
            onDay={(k) => setDay(k === day ? null : k)} onOpen={setOpen}
            onMove={(n) => setMonthCursor(shiftMonth(monthCursor, n))} onToday={() => { setMonthCursor(today); setDay(today); }} />
        ) : null}
        <AgendaView events={agenda} tz={cal.timezone} today={today} onOpen={setOpen} range={rangeText}
          active={agendaActive} custom={agendaCustom} mode={mode} onMode={setMode}
          onPick={(c) => { setAgendaChoice(c); setAgendaCustom(""); }} onCustom={setAgendaCustom}
          empty={searching ? t("Nothing matches that.") : t("Nothing in this period yet.")} />
        <VenueIndex venues={venues} onPick={(place) => setText(place)} />
        <ChangeTape changes={tape} tz={cal.timezone} />
        <WhenNear height="min(420px, 60vh)">
          <Suspense fallback={<p className="cal-dim">{t("Loading…")}</p>}>
            <PlacesSection slug={cal.slug} tz={cal.timezone} events={shown} onOpen={setOpen} />
          </Suspense>
        </WhenNear>
      </main>

      {open ? (
        <EventSheet e={open} tz={cal.timezone} canEdit={editable} onClose={() => setOpen(null)}
          onEdit={onEdit} onDelete={(scope) => void onDelete(scope)} onCalendar={() => addToCalendar(open)} />
      ) : null}
      {editing && editable ? (
        <div className="cal-sheet-back" onClick={() => setEditing(null)}>
          <div className="cal-sheet cal-sheet-form" role="dialog" aria-modal="true" aria-label={t("Event")} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="cal-sheet-x" onClick={() => setEditing(null)} aria-label={t("Close")}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" /></svg>
            </button>
            <EventComposer key={`${editing.event?.id ?? "new"}:${editing.scope ?? ""}:${editing.occurrenceDay ?? editing.day ?? ""}`} slug={cal.slug} tz={cal.timezone}
              event={editing.event} scope={editing.scope} occurrenceDay={editing.occurrenceDay} day={editing.day}
              venues={memory} onDone={onSaved} onRefresh={() => setTick((n) => n + 1)} />
          </div>
        </div>
      ) : null}
      {sharing ? <ShareDialog slug={cal.slug} name={cal.name} protectedCal={cal.protected} onClose={() => setSharing(false)} /> : null}
    </div>
  );
}
