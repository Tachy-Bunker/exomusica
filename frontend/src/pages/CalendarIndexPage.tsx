// The calendars this visitor may open, and making one (the admin, or anyone when the site allows it). The creator says who may change events.
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createCalendar, listCalendars, messageOf, type CalListItem, type EditMode } from "../lib/calendarApi";
import { CalLangProvider, useCalLang, useCalLangState } from "../lib/calendarI18n";
import "../components/calendar/calendar.css";

export function CalendarIndexPage() {
  const L = useCalLangState();
  return <CalLangProvider value={L}><CalendarIndex /></CalLangProvider>;
}

function CalendarIndex() {
  const nav = useNavigate();
  const { t, lang, setLang } = useCalLang();
  const [list, setList] = useState<CalListItem[] | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [err, setErr] = useState("");               // the server's English sentence; shown translated
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [tz, setTz] = useState("Europe/Paris");
  const [pass, setPass] = useState("");
  const [mode, setMode] = useState<EditMode>("guests");
  const [members, setMembers] = useState("");

  useEffect(() => {
    listCalendars().then((r) => { setList(r.calendars); setCanCreate(r.canCreate); }).catch((x) => setErr(messageOf(x)));
  }, []);

  async function make(e: FormEvent) {
    e.preventDefault(); setErr("");
    try {
      const c = await createCalendar({ name, slug: address.trim() || undefined, timezone: tz, password: pass || undefined, editMode: mode, members: mode === "members" ? members : undefined });
      nav(`/calendar/${c.slug}${lang === "fr" ? "?fr" : ""}`);
    } catch (x) { setErr(messageOf(x)); }
  }

  const countOf = (n: number) => (n === 1 ? t("1 event") : t("{n} events", { n }));
  return (
    <div className="cal-index">
      <div className="cal-head">
        <h1>{t("Calendars")}</h1>
        <div className="cal-actions">
          <button type="button" className="cal-quiet" onClick={() => setLang(lang === "fr" ? "en" : "fr")}>{lang === "fr" ? "English" : "Français"}</button>
        </div>
      </div>
      <p className="cal-dim">{t("Shared calendars anyone can read and add to. A calendar with a password is opened from its link: the password is in the link after the #.")}</p>
      {list === null && !err ? <p className="cal-dim">{t("Loading…")}</p> : null}
      {list && list.length ? (
        <ul className="cal-list">
          {list.map((c) => <li key={c.slug}><Link to={`/calendar/${c.slug}${lang === "fr" ? "?fr" : ""}`}>{c.name}</Link> <span className="cal-dim">{countOf(c.events)} · {c.timezone}{c.protected ? ` · ${t("with a password")}` : ""}</span></li>)}
        </ul>
      ) : list ? <p className="cal-empty">{t("No calendars yet.")}</p> : null}
      {canCreate ? (
        <form className="cal-form" onSubmit={make}>
          <h2>{t("New calendar")}</h2>
          <label>{t("Name")}<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required /></label>
          <label>{t("Address (optional; from the name if empty)")}<input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={60} autoCapitalize="none" /></label>
          <label>{t("Time zone")}<input value={tz} onChange={(e) => setTz(e.target.value)} maxLength={60} /></label>
          <label>{t("Password (optional; leave empty for an open calendar)")}<input type="password" value={pass} onChange={(e) => setPass(e.target.value)} minLength={4} maxLength={120} autoComplete="new-password" /></label>
          <fieldset className="cal-fieldset">
            <legend>{t("Who may change events")}</legend>
            <label><input type="radio" name="new-edit-mode" checked={mode === "guests"} onChange={() => setMode("guests")} /> {t("Anyone who can open it")}</label>
            <label><input type="radio" name="new-edit-mode" checked={mode === "members"} onChange={() => setMode("members")} /> {t("Only these people")}</label>
            {mode === "members" ? <label>{t("Members (site usernames, separated by commas)")}<input value={members} onChange={(e) => setMembers(e.target.value)} maxLength={2000} /></label> : null}
            <p className="cal-dim cal-small">{t("The creator and the site's admin can always change events. A member signs in with their site account and needs no password.")}</p>
          </fieldset>
          <button type="submit" className="cal-primary">{t("Make it")}</button>
        </form>
      ) : list ? <p className="cal-dim cal-small">{t("Only the site's admin makes calendars here.")}</p> : null}
      {err ? <p className="cal-err" role="alert">{t(err)}</p> : null}
    </div>
  );
}
