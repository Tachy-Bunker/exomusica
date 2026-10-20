// Share the calendar (fix414): its link, and for a protected one the link that carries the password. The page never keeps the password
// (it is only in the link once and then cleaned from the address bar), so the password is typed here, for this link only, and not stored.
// The subscription (fix420, idea 10): a link a calendar app keeps in step with the site, and the steps for the usual apps. A protected
// calendar's link carries its key, made here on the first open; renewing the key cuts off the links already given out.
import { useEffect, useState } from "react";
import { useCalLang } from "../../lib/calendarI18n";
import { feedKey, messageOf } from "../../lib/calendarApi";
import { feedLinks } from "../../lib/calendarFeedLinks";

interface Props { slug: string; name: string; protectedCal: boolean; onClose: () => void }

export function ShareDialog({ slug, name, protectedCal, onClose }: Props) {
  const { t, lang } = useCalLang();
  const [pw, setPw] = useState("");
  const [said, setSaid] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [keyErr, setKeyErr] = useState("");
  const [renewing, setRenewing] = useState(false);
  const base = `${window.location.origin}/calendar/${encodeURIComponent(slug)}${lang === "fr" ? "?fr" : ""}`;
  const withPw = pw ? `${base}#${encodeURIComponent(pw)}` : "";
  const canNative = typeof navigator !== "undefined" && typeof navigator.share === "function";
  // An open calendar's feed needs no key. A protected one's needs its key, which is asked for once, here.
  const links = !protectedCal || key ? feedLinks(window.location.origin, slug, protectedCal ? key : null) : null;

  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  useEffect(() => {
    if (!protectedCal) return;
    let live = true;
    feedKey(slug).then(
      (r) => { if (live) { if (r.key) setKey(r.key); else setKeyErr("Could not make the link."); } },
      (e: unknown) => { if (live) setKeyErr(messageOf(e)); },
    );
    return () => { live = false; };
  }, [slug, protectedCal]);

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setSaid(t("Copied.")); }
    catch { setSaid(t("Select the link and copy it.")); }
  }
  async function native() {
    try { await navigator.share({ title: name, url: base }); }
    catch { /* the sheet was closed: nothing to do */ }
  }
  async function renew() {
    setRenewing(false);
    try {
      const r = await feedKey(slug, true);
      if (!r.key) throw new Error("Could not make the link.");
      setKey(r.key); setKeyErr(""); setSaid(t("New link made. The old links no longer work."));
    } catch (e) { setKeyErr(messageOf(e)); }
  }

  return (
    <div className="cal-sheet-back" onClick={onClose}>
      <article className="cal-sheet cal-share" role="dialog" aria-modal="true" aria-label={t("Share this calendar")} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="cal-sheet-x" onClick={onClose} aria-label={t("Close")}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" /></svg>
        </button>
        <h2>{t("Share this calendar")}</h2>
        <p className="cal-dim cal-small">{t("Anyone with the link can open it. Whether they can change events is set in the settings.")}</p>
        <label>{t("The link")}
          <span className="cal-line-row">
            <input readOnly value={base} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="cal-quiet" onClick={() => void copy(base)}>{t("Copy")}</button>
          </span>
        </label>
        {canNative ? <button type="button" className="cal-quiet" onClick={() => void native()}>{t("Share…")}</button> : null}

        {protectedCal ? (
          <div className="cal-share-pw">
            <h3>{t("Link with the password")}</h3>
            <p className="cal-dim cal-small">{t("Type the password. The link then opens the calendar without asking for it. It is not kept anywhere.")}</p>
            <label>{t("Password")}<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" maxLength={120} /></label>
            {pw ? (
              <label>{t("The link with the password")}
                <span className="cal-line-row">
                  <input readOnly value={withPw} onFocus={(e) => e.currentTarget.select()} />
                  <button type="button" className="cal-quiet" onClick={() => void copy(withPw)}>{t("Copy")}</button>
                </span>
              </label>
            ) : null}
            {pw ? <p className="cal-note cal-small">{t("Whoever has that link can change events too, if the calendar lets guests change them.")}</p> : null}
          </div>
        ) : null}

        <div className="cal-feed">
          <h3>{t("Subscribe in your calendar app")}</h3>
          <p className="cal-dim cal-small">{t("Your calendar app keeps this calendar up to date on its own. Nobody has to come back to the site. How often it checks depends on the app: Google Calendar is the slowest.")}</p>
          {links ? (
            <>
              <label>{t("For Apple Calendar, Outlook and phones")}
                <span className="cal-line-row">
                  <input readOnly value={links.webcal} onFocus={(e) => e.currentTarget.select()} />
                  <button type="button" className="cal-quiet" onClick={() => void copy(links.webcal)}>{t("Copy")}</button>
                </span>
              </label>
              <label>{t("For Google Calendar on a computer")}
                <span className="cal-line-row">
                  <input readOnly value={links.https} onFocus={(e) => e.currentTarget.select()} />
                  <button type="button" className="cal-quiet" onClick={() => void copy(links.https)}>{t("Copy")}</button>
                </span>
              </label>
              <a className="cal-quiet cal-open" href={links.webcal}>{t("Open in my calendar app")}</a>
              <p className="cal-note cal-small">{protectedCal ? t("This link opens the calendar without its password, so anyone with it can read its events.") : t("Anyone with this link can read the events, as on the site.")}</p>
              {protectedCal && !renewing ? <button type="button" className="cal-quiet cal-open" onClick={() => setRenewing(true)}>{t("Renew the link")}</button> : null}
              {protectedCal && renewing ? (
                <div className="cal-feed-renew">
                  <span className="cal-small">{t("The old links stop working. Make a new one?")}</span>
                  <button type="button" className="cal-primary" onClick={() => void renew()}>{t("Make a new link")}</button>
                  <button type="button" className="cal-quiet" onClick={() => setRenewing(false)}>{t("Keep this one")}</button>
                </div>
              ) : null}
            </>
          ) : keyErr ? null : <p className="cal-dim cal-small">{t("Making the link…")}</p>}
          <details className="cal-guide">
            <summary>{t("How to subscribe")}</summary>
            <ol className="cal-feed-steps">
              <li>{t("iPhone: Settings, then Calendar (on recent versions: Apps, then Calendar), then Accounts, Add Account, Other, Add Subscribed Calendar. Paste the first link and tap Next, then Save.")}</li>
              <li>{t("Mac: in the Calendar app, File, New Calendar Subscription. Paste the first link and click Subscribe.")}</li>
              <li>{t("Outlook on the web: Add calendar, Subscribe from web. Paste the first link and click Import.")}</li>
              <li>{t("Google Calendar on a computer: next to Other calendars, click +, then From URL. Paste the second link and click Add calendar. Google checks the link on its own schedule, so a change can take hours to show.")}</li>
              <li>{t("Android: add the calendar with Google Calendar on a computer, as above. It then shows up on the phone.")}</li>
            </ol>
          </details>
        </div>
        {keyErr ? <p className="cal-note cal-small" role="status">{t(keyErr)}</p> : null}
        {said ? <p className="cal-note" role="status">{said}</p> : null}
      </article>
    </div>
  );
}
