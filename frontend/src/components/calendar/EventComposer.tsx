// Add or change an event. The one line at the top is read first ("Ambient set at Le Trianon, 2 Nov 20:00", or a link), and the fields
// fill in; the guest checks them and saves. A pasted link is read as well: its title, text and picture come in when the fields are empty.
import { useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { parseQuickAdd } from "../../lib/calendarQuickAdd";
import { addDays, dayStartIso, parseKey, timeOf, todayKey, dayKey, zonedToUtc } from "../../lib/calendarTime";
import { useCalLang } from "../../lib/calendarI18n";
import { addEvent, editEvent, previewLink, rememberName, savedName, uploadPicture, type CalEvent, type CalImage, type EventInput } from "../../lib/calendarApi";
import { ApiError } from "../../lib/api";

interface Props { slug: string; tz: string; event?: CalEvent; day?: string; onDone: (saved: CalEvent | null) => void }
const pad = (n: number): string => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;

export function EventComposer({ slug, tz, event, day, onDone }: Props) {
  const { t, locale } = useCalLang();
  const fail = (x: unknown): string => (x instanceof ApiError ? t(x.message) : x instanceof Error ? t(x.message) : t("Something went wrong."));
  const [line, setLine] = useState("");
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(event ? dayKey(event.startsAt, tz) : day ?? todayKey(tz));
  const [start, setStart] = useState(event && !event.allDay ? timeOf(event.startsAt, tz) : "");
  const [end, setEnd] = useState(event?.endsAt ? timeOf(event.endsAt, tz) : "");
  const [location, setLocation] = useState(event?.location ?? "");
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
    if (r.location) setLocation(r.location);
    if (r.date) setDate(ymd(r.date.y, r.date.m, r.date.d));
    if (r.start) setStart(r.start);
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
    const body: EventInput = {
      title: title.trim(), text: text.trim(), url: url.trim() || null, location: location.trim(),
      startsAt, endsAt, allDay, imageId: image?.id ?? null, addedBy: addedBy.trim(),
    };
    setBusy(true);
    try {
      if (addedBy.trim()) rememberName(addedBy.trim());
      const saved = event ? await editEvent(slug, event.id, body) : await addEvent(slug, body);
      onDone(saved);
    } catch (x) { setErr(fail(x)); }
    finally { setBusy(false); }
  }

  return (
    <form className="cal-form" onSubmit={save} aria-busy={busy}>
      <h2>{event ? t("Change the event") : t("Add an event")}</h2>
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
        <label>{t("Start")}<input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label>{t("End")}<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <p className="cal-dim cal-small">{t("Times are in this calendar's time zone ({tz}). No start time means all day.", { tz })}</p>
      <label>{t("Place")}<input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={160} /></label>
      <label>{t("Link")}<input type="url" value={url} onChange={(e) => setUrl(e.target.value)} onPaste={(e) => { const p = e.clipboardData.getData("text").trim(); if (/^https?:\/\/\S+$/i.test(p)) { e.preventDefault(); setUrl(p); void readLink(p, { title, text }); } }} placeholder="https://" /></label>
      <label>{t("Text")}<textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={4} /></label>
      <div className="cal-picture">
        {image ? <img src={image.url} alt="" /> : null}
        <label className="cal-quiet">{image ? t("Change the picture") : t("Add a picture")}<input type="file" accept="image/*" onChange={(e) => void pick(e.target.files?.[0])} /></label>
        {image ? <button type="button" className="cal-quiet" onClick={() => setImage(null)}>{t("Remove the picture")}</button> : null}
      </div>
      <label>{t("Your name (shown as “added by”)")}<input value={addedBy} onChange={(e) => setAddedBy(e.target.value)} maxLength={40} /></label>

      <div className="cal-actions">
        <button type="submit" className="cal-primary" disabled={busy}>{busy ? "…" : event ? t("Save changes") : t("Add event")}</button>
        <button type="button" className="cal-quiet" onClick={() => onDone(null)}>{t("Cancel")}</button>
      </div>
    </form>
  );
}
