// Add or change an event. The line at the top is read first ("Ambient set at Le Trianon, 2 Nov 20:00", or a link) and the fields fill in.
// The place is searched as it is typed: one answer sets the coordinates, several are listed to pick from; typed "lat, lng" is taken as it is.
// A repeat has an end and days left out. Changing one day of a repeat makes that day its own event and leaves the day out of the series.
import { useEffect, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { parseQuickAdd } from "../../lib/calendarQuickAdd";
import { venueNamed, type VenueMemo } from "../../lib/calendarToday";
import { addDays, dayLabel, dayStartIso, parseKey, timeOf, todayKey, dayKey, zonedToUtc } from "../../lib/calendarTime";
import { parseCoordinates, shortPlace } from "../../lib/calendarPlace";
import { useCalLang } from "../../lib/calendarI18n";
import { addEvent, editEvent, geocodeAddress, messageOf, previewLink, rememberName, savedName, skipDay, uploadPicture, type CalEvent, type CalImage, type EventInput, type Place, type Recurrence } from "../../lib/calendarApi";
import { ApiError } from "../../lib/api";

export type ComposeScope = "one" | "all";
interface Props {
  slug: string; tz: string; event?: CalEvent; scope?: ComposeScope; occurrenceDay?: string; day?: string;
  onDone: (saved: CalEvent | null) => void; onRefresh: () => void;
  /** The places this calendar knows (idea 15): a typed place that is one of them fills what it has. */
  venues?: VenueMemo[];
}
const pad = (n: number): string => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;
const REPEATS: Recurrence[] = ["daily", "weekly", "monthly", "yearly"];
const REPEAT_LABEL: Record<Recurrence, string> = { daily: "Every day", weekly: "Every week", monthly: "Every month", yearly: "Every year" };
/** How long the place is left alone after the last key, before it is searched. */
const PLACE_PAUSE_MS = 600;

export function EventComposer({ slug, tz, event, scope = "all", occurrenceDay, day, onDone, onRefresh, venues = [] }: Props) {
  const { t, locale } = useCalLang();
  const fail = (x: unknown): string => (x instanceof ApiError ? t(x.message) : x instanceof Error ? t(x.message) : t("Something went wrong."));
  const one = !!event && scope === "one" && !!occurrenceDay;          // this day of a repeat only
  const [line, setLine] = useState("");
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(one ? occurrenceDay! : event ? dayKey(event.startsAt, tz) : day ?? todayKey(tz));
  const [start, setStart] = useState(event && !event.allDay ? timeOf(event.startsAt, tz) : "");
  const [end, setEnd] = useState(event?.endsAt ? timeOf(event.endsAt, tz) : "");
  // A remembered place may fill the start of a new event, until the start is set by hand (or by the line at the top).
  const [autoStart, setAutoStart] = useState(!event);
  const [location, setLocation] = useState(event?.location ?? "");
  // The place text that is settled (picked, or found for a single answer): it is not searched again.
  const [chosen, setChosen] = useState<string | null>(event?.location?.trim() || null);
  // The coordinates came from a search or a pick: a new place text clears them, until the new place is found.
  const [autoCoords, setAutoCoords] = useState(!!event && event.lat !== null);
  const [lat, setLat] = useState(event?.lat != null ? String(event.lat) : "");
  const [lng, setLng] = useState(event?.lng != null ? String(event.lng) : "");
  const [found, setFound] = useState<Place[]>([]);
  const [finding, setFinding] = useState(false);
  const [rec, setRec] = useState<Recurrence | "">(!one && event?.recurrence ? event.recurrence : "");
  const [until, setUntil] = useState(!one && event?.recurUntil ? event.recurUntil : "");
  const [skipped, setSkipped] = useState<string[]>(!one && event ? event.exdates : []);
  const [url, setUrl] = useState(event?.url ?? "");
  const [text, setText] = useState(event?.text ?? "");
  const [image, setImage] = useState<CalImage | null>(event?.image ?? null);
  const [addedBy, setAddedBy] = useState(event?.addedBy || savedName());
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  /** A link: read the page, and fill what is still empty. */
  async function readLink(link: string, fill: { title: string; text: string }) {
    setBusy(true); setNote(t("Reading the link…")); setErr("");
    try {
      const p = await previewLink(slug, link);
      setUrl(p.url);
      if (!fill.title.trim() && p.title) setTitle(p.title);
      if (!fill.text.trim() && p.description) setText(p.description);
      if (p.image) setImage(p.image);
      setNote([t("Read the link: {name}", { name: p.siteName ?? p.title ?? p.url }), p.removed > 0 ? t("To make room, the oldest picture on this calendar was removed.") : ""].filter(Boolean).join(" "));
    } catch (x) { setNote(""); setErr(fail(x)); }
    finally { setBusy(false); }
  }

  /** The line at the top: a link, or "X at X" with a day and a time. */
  function readLine() {
    const raw = line.trim();
    if (!raw) return;
    const r = parseQuickAdd(raw, parseKey(todayKey(tz)));
    if (r.url) setUrl(r.url);
    if (r.ok) setTitle(r.title);
    if (r.location) { setLocation(r.location); applyVenue(r.location, !r.start); }
    if (r.date) setDate(ymd(r.date.y, r.date.m, r.date.d));
    if (r.start) { setStart(r.start); setAutoStart(false); }
    if (r.end) setEnd(r.end);
    const got = [r.ok && t("title “{v}”", { v: r.title }), r.location && t("place “{v}”", { v: r.location }), r.date && t("day"), r.start && t("start {v}", { v: r.start }), r.end && t("end {v}", { v: r.end }), r.url && t("link")].filter(Boolean);
    setNote(got.length ? t("Read: {parts}. Check it, then save.", { parts: got.join(", ") }) : t("Nothing was read from that line."));
    if (r.url && !r.ok) void readLink(r.url, { title, text });
    else if (r.url) void readLink(r.url, { title: r.title, text });
    setLine("");
  }

  function onLineKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); readLine(); }
  }
  /** Pasting a link into the line reads it straight away. */
  function onLinePaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").trim();
    if (/^https?:\/\/\S+$/i.test(pasted)) { e.preventDefault(); setLine(""); void readLink(pasted, { title, text }); }
  }

  /** The place, searched as it is typed (after a short pause). Typed coordinates are taken as they are. */
  useEffect(() => {
    const typed = location.trim();
    if (!typed || typed === chosen) { setFound([]); return; }
    const at = parseCoordinates(typed);
    if (at) { setLat(String(at.lat)); setLng(String(at.lng)); setAutoCoords(false); setFound([]); return; }
    if (typed.length < 3) { setFound([]); return; }
    let alive = true;
    const timer = window.setTimeout(async () => {
      setFinding(true); setErr("");
      try {
        const places = await geocodeAddress(slug, typed);
        if (!alive) return;
        if (!places.length) setErr(t("Nothing found for that address."));
        else if (places.length === 1) {
          setLat(String(places[0].lat)); setLng(String(places[0].lng));
          setAutoCoords(true); setChosen(typed); setFound([]);
        } else setFound(places);
      } catch (x) { if (alive) setErr(t(messageOf(x))); }
      finally { if (alive) setFinding(false); }
    }, PLACE_PAUSE_MS);
    return () => { alive = false; window.clearTimeout(timer); setFinding(false); };
  }, [location, chosen, slug, t]);

  /** A remembered place (idea 15), typed exactly: it fills the coordinates it has, when this place has none or they came from a search;
   *  and for a new event with no start yet, its usual start. Its coordinates settle the name, so the name is not searched again. */
  function applyVenue(typed: string, allowStart: boolean) {
    const known = venueNamed(venues, typed);
    if (!known) return;
    let got = "";
    if (known.lat !== null && known.lng !== null && (lat === "" || autoCoords)) {
      setLat(String(known.lat)); setLng(String(known.lng)); setAutoCoords(true); setChosen(typed.trim());
      got = t("Known place: coordinates filled in.");
    }
    if (allowStart && autoStart && known.start) {
      setStart(known.start);
      got = got ? t("Known place: coordinates and usual start filled in.") : t("Known place: usual start filled in.");
    }
    if (got) setNote(got);
  }
  /** Typing a new place drops the coordinates that came from the last search. */
  function onPlaceType(v: string) {
    setLocation(v);
    if (autoCoords && v.trim() !== chosen) { setLat(""); setLng(""); setAutoCoords(false); }
    applyVenue(v, true);
  }
  /** One of several answers is picked: its name and coordinates are the place. */
  function pickPlace(p: Place) {
    const label = shortPlace(p.label);
    setLocation(label); setChosen(label);
    setLat(String(p.lat)); setLng(String(p.lng));
    setAutoCoords(true); setFound([]);
  }

  async function putBack(d: string) {
    if (!event) return;
    setErr("");
    try { const r = await skipDay(slug, event.id, d, false); setSkipped(r.exdates); onRefresh(); }
    catch (x) { setErr(fail(x)); }
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    setBusy(true); setErr(""); setNote("");
    try {
      const up = await uploadPicture(slug, f);
      setImage({ id: up.id, url: up.url });
      if (up.removed > 0) setNote(t("To make room, the oldest picture on this calendar was removed."));
    }
    catch (x) { setErr(fail(x)); }
    finally { setBusy(false); }
  }

  async function save(e: FormEvent) {
    e.preventDefault(); setErr("");
    if (!title.trim()) { setErr(t("Give the event a title.")); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setErr(t("Pick a day.")); return; }
    const { y, m, d } = parseKey(date);
    const allDay = !start;
    let startsAt: string, endsAt: string | null = null;
    if (allDay) startsAt = dayStartIso(date, tz);
    else {
      const [hh, mm] = start.split(":").map(Number);
      startsAt = zonedToUtc(y, m, d, hh, mm, tz).toISOString();
      if (end) {
        const [eh, em] = end.split(":").map(Number);
        const overnight = end <= start;
        const ed = overnight ? addDays(date, 1) : date;
        const p = parseKey(ed);
        endsAt = zonedToUtc(p.y, p.m, p.d, eh, em, tz).toISOString();
      }
    }
    const repeat = !one && rec ? rec : null;
    const body: EventInput = {
      title: title.trim(), text: text.trim(), url: url.trim() || null, location: location.trim(),
      startsAt, endsAt, allDay, imageId: image?.id ?? null, addedBy: addedBy.trim(),
      lat: lat === "" ? null : Number(lat), lng: lng === "" ? null : Number(lng),
      recurrence: repeat, recurUntil: repeat && until ? until : null,
    };
    setBusy(true);
    try {
      if (addedBy.trim()) rememberName(addedBy.trim());
      if (one) {
        // This day only: the day becomes its own event, and the repeat leaves it out.
        const own = await addEvent(slug, body);
        await skipDay(slug, event!.id, occurrenceDay!, true);
        onDone(own);
      } else {
        const saved = event ? await editEvent(slug, event.id, body) : await addEvent(slug, body);
        onDone(saved);
      }
    } catch (x) { setErr(fail(x)); }
    finally { setBusy(false); }
  }

  const skippedWords = skipped.slice().sort();
  return (
    <form className="cal-form" onSubmit={save} aria-busy={busy}>
      <h2>{one ? t("Change this day") : event ? t("Change the event") : t("Add an event")}</h2>
      {one ? <p className="cal-dim cal-small">{t("Only this day of the repeat changes. The other days stay as they are.")}</p> : null}
      <label className="cal-line">
        <span>{t("Quick add: “Ambient set at Le Trianon, 2 Nov 20:00”, “Live samedi de 20h à 23h au Glazart”, or paste a link")}</span>
        <span className="cal-line-row">
          <input value={line} onChange={(e) => setLine(e.target.value)} onKeyDown={onLineKey} onPaste={onLinePaste} placeholder={t("Type a line, then Enter")} maxLength={300} />
          <button type="button" className="cal-quiet" onClick={readLine} disabled={!line.trim()}>{t("Read")}</button>
        </span>
      </label>
      {note ? <p className="cal-note" role="status">{note}</p> : null}
      {err ? <p className="cal-err" role="alert">{err}</p> : null}

      <label>{t("Title")}<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required /></label>
      <div className="cal-form-times">
        <label>{t("Day")}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
        <label>{t("Start")}<input type="time" value={start} onChange={(e) => { setStart(e.target.value); setAutoStart(false); }} /></label>
        <label>{t("End")}<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <p className="cal-dim cal-small">{t("Times are in this calendar's time zone ({tz}). No start time means all day.", { tz })}</p>

      <div className="cal-place-block">
        <label>{t("Place")}
          <input value={location} onChange={(e) => onPlaceType(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
            maxLength={160} placeholder={t("An address, or “48.85, 2.35”")} />
        </label>
        {finding ? <p className="cal-dim cal-small" role="status">{t("Searching…")}</p> : null}
        {found.length ? (
          <ul className="cal-found" aria-label={t("Places found")}>
            {found.map((p) => (
              <li key={`${p.lat},${p.lng}`}><button type="button" className="cal-place" onClick={() => pickPlace(p)}><span>{shortPlace(p.label)}</span><span className="cal-dim cal-small">{p.label}</span></button></li>
            ))}
          </ul>
        ) : null}
        <div className="cal-coords">
          <label>{t("Latitude")}<input type="number" step="any" min={-90} max={90} value={lat} onChange={(e) => { setLat(e.target.value); setAutoCoords(false); }} /></label>
          <label>{t("Longitude")}<input type="number" step="any" min={-180} max={180} value={lng} onChange={(e) => { setLng(e.target.value); setAutoCoords(false); }} /></label>
        </div>
      </div>

      <label>{t("Link")}<input type="url" value={url} onChange={(e) => setUrl(e.target.value)} onPaste={(e) => { const p = e.clipboardData.getData("text").trim(); if (/^https?:\/\/\S+$/i.test(p)) { e.preventDefault(); setUrl(p); void readLink(p, { title, text }); } }} placeholder="https://" /></label>
      <label>{t("Text")}<textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={4} /></label>

      {!one ? (
        <div className="cal-repeat-block">
          <label>{t("Repeats")}
            <select value={rec} onChange={(e) => setRec(e.target.value as Recurrence | "")}>
              <option value="">{t("Does not repeat")}</option>
              {REPEATS.map((r) => <option key={r} value={r}>{t(REPEAT_LABEL[r])}</option>)}
            </select>
          </label>
          {rec ? <label>{t("Until (optional)")}<input type="date" value={until} min={date} onChange={(e) => setUntil(e.target.value)} /></label> : null}
          {skippedWords.length ? (
            <div className="cal-skips">
              <p className="cal-dim cal-small">{t("Days left out of this repeat:")}</p>
              <ul>
                {skippedWords.map((d) => (
                  <li key={d}>
                    <span>{dayLabel(d, { weekday: "short", day: "numeric", month: "short", year: "numeric" }, locale)}</span>{" "}
                    <button type="button" className="cal-quiet" onClick={() => void putBack(d)}>{t("Put it back")}</button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="cal-picture">
        {image ? <img src={image.url} alt="" /> : null}
        <label className="cal-quiet">{image ? t("Change the picture") : t("Add a picture")}<input type="file" accept="image/*" onChange={(e) => void pick(e.target.files?.[0])} /></label>
        {image ? <button type="button" className="cal-quiet" onClick={() => setImage(null)}>{t("Remove the picture")}</button> : null}
      </div>
      <label>{t("Your name (shown as “added by”)")}<input value={addedBy} onChange={(e) => setAddedBy(e.target.value)} maxLength={40} /></label>

      <div className="cal-actions">
        <button type="submit" className="cal-primary" disabled={busy}>{busy ? "…" : one ? t("Save this day") : event ? t("Save changes") : t("Add event")}</button>
        <button type="button" className="cal-quiet" onClick={() => onDone(null)}>{t("Cancel")}</button>
      </div>
    </form>
  );
}
