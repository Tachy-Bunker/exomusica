// The change tape (fix416, idea 9): one mark per change, oldest on the left, so a busy stretch reads as a dense strip.
// The list under it says who did what. Nothing is shown until something has changed.
import { useCalLang } from "../../lib/calendarI18n";
import { dayKey, dayLabel, timeOf } from "../../lib/calendarTime";
import type { TapeChange } from "../../lib/calendarApi";
import "./calendarViz.css";

const VERB: Record<TapeChange["action"], string> = {
  added: "Added", moved: "Moved", changed: "Changed", cancelled: "Cancelled", skipped: "Skipped a day of", back: "Put back a day of",
};
const MARKS = 40; // the strip's width in changes; the list under it shows the latest eight

export function ChangeTape({ changes, tz }: { changes: TapeChange[]; tz: string }) {
  const { t, locale } = useCalLang();
  if (!changes || changes.length === 0) return null;
  const marks = changes.slice(0, MARKS).reverse();
  const when = (iso: string) => `${dayLabel(dayKey(iso, tz), { day: "numeric", month: "short" }, locale)} ${timeOf(iso, tz)}`;
  return (
    <section className="cal-section" aria-labelledby="cal-h-tape">
      <h2 id="cal-h-tape">{t("Changes")}</h2>
      <p className="cal-dim cal-small">{t("Each mark is one change, oldest on the left.")}</p>
      <div className="cal-tape" role="img" aria-label={t("{n} changes", { n: marks.length })}>
        {marks.map((c) => <i key={c.id} className={`cal-tape-mark is-${c.action}`} title={`${t(VERB[c.action])} ${c.title}`} />)}
      </div>
      <ol className="cal-tape-list">
        {changes.slice(0, 8).map((c) => (
          <li key={c.id}>
            {t("{verb} {title}, by {who}", { verb: t(VERB[c.action]), title: c.title, who: c.who || t("a guest") })} <span className="cal-dim">{when(c.at)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
