import { useMemo, useState } from "react";
import { daysBetween, relDay } from "../../lib/outreachSheet";
import { lookAlikes, fitScore } from "../../lib/fit";
import { parseSnooze, todayLists } from "../../lib/today";
import type { Col, Contact, FitProfile, Group } from "./types";

const who = (c: Contact) => c.name || c.email || `#${c.id}`;

/** What to do next, without browsing the sheet: follow-ups due, calls closing, who to write to next, and who has gone quiet. */
export function TodayPanel({ contacts, groups, columns, today, quietAfter, profile, onWrite, onFollowUp, onStatus, onSnooze }: {
  contacts: Contact[]; groups: Group[]; columns: Col[]; today: string; quietAfter: number; profile: Partial<FitProfile>; onSnooze: (id: number, until: string, reason: string) => void; onWrite: (ids: number[]) => void; onFollowUp: (id: number) => void; onStatus: (id: number, status: string) => void;
}) {
  const [group, setGroup] = useState<number | null>(null);
  const L = useMemo(() => {
    const l = todayLists(contacts, today, { group, ghostDays: quietAfter, freshMax: 200 });
    // best fit first, then the nearest deadline
    const fit = new Map(l.fresh.map((c) => [c.id, fitScore(c, columns, profile, today).score]));
    return { ...l, fresh: [...l.fresh].sort((a, b) => (fit.get(b.id) ?? 0) - (fit.get(a.id) ?? 0)).slice(0, 5), fit };
  }, [contacts, today, group, quietAfter, columns, profile]);
  const alike = useMemo(() => lookAlikes(contacts, columns, groups, today, 5), [contacts, columns, groups, today]);
  const snooze = (c: Contact) => {
    const v = prompt("Snooze until when? (3d, 2w, a date, or “after 15 march”). Add a reason after a dash: “2w - waiting for their jury”", "1w"); if (!v) return;
    const r = parseSnooze(v, today); if (!r.until) { alert("Couldn't read that date."); return; } onSnooze(c.id, r.until, r.reason);
  };
  const total = L.followUps.length + L.deadlines.length + L.ghostable.length + L.ladder.length;
  return (
    <details className="ox-today" open={total > 0}>
      <summary><b>Today</b> <span className="ox-dim">{total ? `${L.followUps.length} follow-up${L.followUps.length === 1 ? "" : "s"}, ${L.deadlines.length} closing soon` : "nothing is waiting"}</span></summary>
      <div className="ox-today-grid">
        <section>
          <h4>Follow up <small>{L.followUps.length}</small></h4>
          {L.followUps.length === 0 && <p className="ox-dim">No reminder has come due.</p>}
          <ul>{L.followUps.slice(0, 8).map((c) => (
            <li key={c.id}><span><b>{who(c)}</b> <small className="ox-due">{relDay(today, c.followUpAt)}</small>{c.snoozeReason && <small className="ox-dim"> · {c.snoozeReason}</small>}</span>
              <span className="ox-li-btns"><button className="btn" onClick={() => snooze(c)} title="Push the reminder back, with a reason">Snooze</button><button className="btn" onClick={() => onFollowUp(c.id)} disabled={!c.email}>Follow up</button><button className="btn" onClick={() => onStatus(c.id, "replied")} title="They answered: stops the reminder">Replied</button></span></li>))}</ul>
        </section>
        <section>
          <h4>Closing soon <small>{L.deadlines.length}</small></h4>
          {L.deadlines.length === 0 && <p className="ox-dim">No deadlines in the next two weeks.</p>}
          <ul>{L.deadlines.slice(0, 8).map((c) => { const d = daysBetween(today, c.deadline as string); return (
            <li key={c.id}><span><b>{who(c)}</b> <small className={d <= 3 ? "ox-due" : "ox-dim"}>{L.ladder.some((r) => r.contact.id === c.id) && <span className="ox-tag">{d <= 2 ? "2 days" : "7 days"}</span>} {d < 0 ? "closed yesterday" : d === 0 ? "closes today" : `${d} day${d === 1 ? "" : "s"} left`}</small>{c.sentCount === 0 && <small className="ox-dim"> · not written to</small>}</span>
              <span className="ox-li-btns"><button className="btn btn-primary" onClick={() => onWrite([c.id])} disabled={!c.email}>✉ Write</button></span></li>); })}</ul>
        </section>
        <section>
          <h4>Write next <small>{L.fresh.length}</small> <select aria-label="Group to draw from" value={group ?? ""} onChange={(e) => setGroup(e.target.value ? Number(e.target.value) : null)}><option value="">any group</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></h4>
          {L.fresh.length === 0 && <p className="ox-dim">Everyone with an address has been written to.</p>}
          <ul>{L.fresh.map((c) => <li key={c.id}><span><b>{who(c)}</b>{profile.keywords?.length || profile.avoid?.length || profile.maxFee != null ? <small className="ox-dim"> · fit {L.fit.get(c.id)}</small> : null}{c.deadline && <small className="ox-dim"> · closes {c.deadline}</small>}</span><span className="ox-li-btns"><button className="btn" onClick={() => onWrite([c.id])}>✉ Write</button></span></li>)}</ul>
          {L.fresh.length > 1 && <button className="btn" onClick={() => onWrite(L.fresh.map((c) => c.id))}>Write to these {L.fresh.length}</button>}
        </section>
        <section>
          <h4>Gone quiet <small>{L.ghostable.length}</small></h4>
          {L.ghostable.length === 0 && <p className="ox-dim">Nobody has been waiting over {quietAfter} days.</p>}
          <ul>{L.ghostable.map((c) => <li key={c.id}><span><b>{who(c)}</b> <small className="ox-dim">{relDay(today, c.lastSentAt)}</small></span><span className="ox-li-btns"><button className="btn" onClick={() => onFollowUp(c.id)}>Nudge</button><button className="btn" onClick={() => onStatus(c.id, "ghosted")} title="Stop counting on an answer">No answer</button></span></li>)}</ul>
        </section>
        {(L.reopening.length > 0 || alike.length > 0) && (
          <section>
            {L.reopening.length > 0 && <><h4>Opens again <small>{L.reopening.length}</small></h4><ul>{L.reopening.map((c) => <li key={c.id}><span><b>{who(c)}</b> <small className="ox-dim">around {c.reopensAt}</small></span></li>)}</ul></>}
            {alike.length > 0 && <><h4>Like your accepted calls <small>{alike.length}</small></h4><ul>{alike.map((a) => <li key={a.contact.id}><span><b>{who(a.contact)}</b> <small className="ox-dim">{a.shared.join(", ")}</small></span><span className="ox-li-btns"><button className="btn" onClick={() => onWrite([a.contact.id])}>✉ Write</button></span></li>)}</ul></>}
          </section>
        )}
      </div>
    </details>
  );
}
