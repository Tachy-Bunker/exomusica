// Share the calendar (fix414): its link, and for a protected one the link that carries the password. The page never keeps the password
// (it is only in the link once and then cleaned from the address bar), so the password is typed here, for this link only, and not stored.
import { useEffect, useState } from "react";
import { useCalLang } from "../../lib/calendarI18n";

interface Props { slug: string; name: string; protectedCal: boolean; onClose: () => void }

export function ShareDialog({ slug, name, protectedCal, onClose }: Props) {
  const { t, lang } = useCalLang();
  const [pw, setPw] = useState("");
  const [said, setSaid] = useState("");
  const base = `${window.location.origin}/calendar/${encodeURIComponent(slug)}${lang === "fr" ? "?fr" : ""}`;
  const withPw = pw ? `${base}#${encodeURIComponent(pw)}` : "";
  const canNative = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setSaid(t("Copied.")); }
    catch { setSaid(t("Select the link and copy it.")); }
  }
  async function native() {
    try { await navigator.share({ title: name, url: base }); }
    catch { /* the sheet was closed: nothing to do */ }
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
        {said ? <p className="cal-note" role="status">{said}</p> : null}
      </article>
    </div>
  );
}
