// Settings: name, time zone, password; who may change events and the members (the creator and the admin); the picture limit
// (the admin); signing everyone out; deleting (the admin only). The server decides every change; this panel only asks.
import { useMemo, useState, type FormEvent } from "react";
import { readCachedUser } from "../../lib/api";
import { deleteCalendar, dropToken, messageOf, signOutEveryone, updateCalendar, type CalView, type EditMode } from "../../lib/calendarApi";
import { useCalLang } from "../../lib/calendarI18n";

function zoneList(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  try { return supported ? supported("timeZone") : ["Europe/Paris", "UTC"]; } catch { return ["Europe/Paris", "UTC"]; }
}

export function CalendarSettings({ cal, onChanged, onGone }: { cal: CalView; onChanged: (c: CalView) => void; onGone: () => void }) {
  const { t } = useCalLang();
  const admin = readCachedUser()?.isAdmin === true;
  const zones = useMemo(zoneList, []);
  const [name, setName] = useState(cal.name);
  const [tz, setTz] = useState(cal.timezone);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [mode, setMode] = useState<EditMode>(cal.editMode);
  const [members, setMembers] = useState(cal.members.join(", "));
  const [cap, setCap] = useState(String(cal.pictureCap));
  // Both are English sentences (the calendar's language is applied where they show).
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function saveBasics(e: FormEvent) {
    e.preventDefault(); setErr(""); setMsg("");
    try { onChanged(await updateCalendar(cal.slug, { name: name.trim(), timezone: tz })); setMsg("Saved."); }
    catch (x) { setErr(messageOf(x)); }
  }
  async function savePassword(e: FormEvent) {
    e.preventDefault(); setErr(""); setMsg("");
    if (!next && !cal.protected) { setErr("Type a new password first."); return; }
    try {
      onChanged(await updateCalendar(cal.slug, { password: next ? next : null, currentPassword: current }));
      setMsg(next ? "Password changed. Everyone else is signed out; the links need the new password." : "Password removed. The calendar is open.");
      setNext(""); setCurrent("");
    } catch (x) { setErr(messageOf(x)); }
  }
  async function saveAccess(e: FormEvent) {
    e.preventDefault(); setErr(""); setMsg("");
    try { onChanged(await updateCalendar(cal.slug, { editMode: mode, members })); setMsg("Saved."); }
    catch (x) { setErr(messageOf(x)); }
  }
  async function saveCap(e: FormEvent) {
    e.preventDefault(); setErr(""); setMsg("");
    try { onChanged(await updateCalendar(cal.slug, { pictureCap: Number(cap) })); setMsg("Saved."); }
    catch (x) { setErr(messageOf(x)); }
  }
  async function signOut() {
    setErr(""); setMsg("");
    try { await signOutEveryone(cal.slug); setMsg("Everyone else is signed out."); }
    catch (x) { setErr(messageOf(x)); }
  }
  async function remove() {
    if (!window.confirm(t("Delete “{name}” and all its events and pictures?", { name: cal.name }))) return;
    try { await deleteCalendar(cal.slug); dropToken(cal.slug); onGone(); }
    catch (x) { setErr(messageOf(x)); }
  }

  return (
    <section className="cal-settings" aria-label={t("Calendar settings")}>
      <form onSubmit={saveBasics} className="cal-settings-form">
        <label>{t("Name")}<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required /></label>
        <label>{t("Time zone")}<select value={tz} onChange={(e) => setTz(e.target.value)}>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</select></label>
        <button type="submit" className="cal-quiet">{t("Save")}</button>
      </form>

      <form onSubmit={savePassword} className="cal-settings-form">
        <h3>{t("Password")}</h3>
        {cal.protected && !admin ? <label>{t("Current password")}<input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></label> : null}
        <label>{t("New password (empty removes it)")}<input type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={4} maxLength={120} autoComplete="new-password" /></label>
        <button type="submit" className="cal-quiet">{cal.protected ? t("Change") : t("Put a password on it")}</button>
      </form>

      <div className="cal-settings-form">
        <h3>{t("Who may change events")}</h3>
        {cal.canManage ? (
          <form onSubmit={saveAccess}>
            <label><input type="radio" name="cal-edit-mode" checked={mode === "guests"} onChange={() => setMode("guests")} /> {t("Anyone who can open it")}</label>
            <label><input type="radio" name="cal-edit-mode" checked={mode === "members"} onChange={() => setMode("members")} /> {t("Only these people")}</label>
            <label>{t("Members (site usernames, separated by commas)")}<input value={members} onChange={(e) => setMembers(e.target.value)} disabled={mode !== "members"} maxLength={2000} /></label>
            <p className="cal-dim cal-small">{t("The creator and the site's admin can always change events. A member signs in with their site account and needs no password.")}</p>
            <button type="submit" className="cal-quiet">{t("Save who may change events")}</button>
          </form>
        ) : (
          <p className="cal-dim cal-small">{cal.editMode === "members" ? `${t("Only these people")}: ${cal.members.join(", ") || "—"}` : t("Anyone who can open it")}</p>
        )}
      </div>

      <div className="cal-settings-form">
        {admin ? (
          <form onSubmit={saveCap}>
            <label>{t("Pictures kept")}<input type="number" min={1} max={2000} value={cap} onChange={(e) => setCap(e.target.value)} /></label>
            <p className="cal-dim cal-small">{t("Past this number, the picture of the oldest event goes. Only the site's admin sets it.")}</p>
            <button type="submit" className="cal-quiet">{t("Save the picture limit")}</button>
          </form>
        ) : (
          <p className="cal-dim cal-small">{t("Pictures kept: {n}", { n: cal.pictureCap })}</p>
        )}
      </div>

      <div className="cal-actions">
        <button type="button" className="cal-quiet" onClick={signOut}>{t("Sign out everyone else")}</button>
        {admin ? <button type="button" className="cal-danger" onClick={remove}>{t("Delete this calendar")}</button> : null}
      </div>
      {msg ? <p className="cal-note" role="status">{t(msg)}</p> : null}
      {err ? <p className="cal-err" role="alert">{t(err)}</p> : null}
    </section>
  );
}
