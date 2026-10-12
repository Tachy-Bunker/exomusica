import { useState } from "react";
import { api } from "../../lib/api";
import { feeBudget } from "../../lib/fit";
import { STATUS_LABEL, STATUS_ORDER, type Col, type Contact, type FitProfile, type Stats, type StatRow } from "./types";

interface Accepted { contactId: number; who: string; subject: string; bodyMd: string; templateName: string | null; sentAt: string }
interface LinkRow { code: string; url: string; clicks: number; lastClickAt: string | null }

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function Table({ title, rows, note }: { title: string; rows: StatRow[]; note?: string }) {
  if (!rows.length) return null;
  return (
    <section>
      <h4>{title}</h4>{note && <p className="ox-hint">{note}</p>}
      <table className="ox-stats"><thead><tr><th>{title.split(" ")[0]}</th><th>Written to</th><th>Answered</th><th>Accepted</th><th>Answer rate</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.name}><td>{r.name}</td><td>{r.people}</td><td>{r.replied}</td><td>{r.accepted}</td><td><span className="ox-bar-cell"><i style={{ width: `${r.rate}%` }} />{r.rate}%</span></td></tr>)}</tbody></table>
    </section>
  );
}

/** What actually gets answers: by group, template, bio version and weekday. Counts people, not mails. */
export function ResultsPanel({ profile, contacts, columns, today }: { profile: Partial<FitProfile>; contacts: Contact[]; columns: Col[]; today: string }) {
  const [s, setS] = useState<Stats | null>(null); const [err, setErr] = useState("");
  const [acc, setAcc] = useState<Accepted[]>([]); const [links, setLinks] = useState<LinkRow[]>([]);
  const load = () => {
    api<Stats>("/api/outreach/stats").then(setS).catch((e) => setErr(e instanceof Error ? e.message : "Couldn't load."));
    api<Accepted[]>("/api/outreach/accepted").then(setAcc).catch(() => {});
    api<LinkRow[]>("/api/outreach/links").then(setLinks).catch(() => {});
  };
  const keep = (a: Accepted) => api("/api/outreach/templates", { method: "POST", body: JSON.stringify({ name: `Accepted: ${a.who}`.slice(0, 80), subject: a.subject, bodyMd: a.bodyMd, rules: [] }) }).then(() => alert("Saved as a template.")).catch((e) => alert(e instanceof Error ? e.message : "Couldn't save."));
  const fees = feeBudget(contacts, columns, today.slice(0, 4), profile.yearlyBudget ?? null);
  const maxDay = s ? Math.max(1, ...s.weekdays.map((d) => d.sent)) : 1;
  return (
    <details className="ox-results" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) void load(); }}>
      <summary><b>Results</b> <span className="ox-dim">what gets answered</span></summary>
      {err && <p className="ox-err">{err}</p>}
      {!s ? <p className="ox-dim">Loading…</p> : (
        <div className="ox-results-grid">
          <section><h4>Overall</h4><p>{s.overall.people} people written to, {s.overall.replied} answered ({s.overall.rate}%), {s.overall.accepted} accepted.</p>
            <p className="ox-chips-lite">{STATUS_ORDER.map((k) => <span key={k} className={"ox-st ox-st-" + k}>{STATUS_LABEL[k]} {s.statuses[k] ?? 0}</span>)}</p></section>
          <Table title="By group" rows={s.groups} />
          <Table title="By template" rows={s.templates} note="Which saved message does best." />
          <Table title="By bio / block version" rows={s.blocks} note="Which version of a block was in the mail." />
          <section><h4>By weekday sent</h4>
            <div className="ox-days">{s.weekdays.map((d, i) => <div key={i} title={`${d.sent} mails, ${d.replied} to people who answered`}><i style={{ height: `${(d.sent / maxDay) * 100}%` }}><b style={{ height: d.sent ? `${(d.replied / d.sent) * 100}%` : 0 }} /></i><span>{DAYS[i]}</span></div>)}</div>
            <p className="ox-hint">Bars are mails sent; the bright part is mails to people who later answered.</p></section>
          {s.variants && s.variants.length > 0 && <Table title="Subject A/B" rows={s.variants} note="A and B alternate through a send; the answer rate is per person." />}
          {s.hours && s.hours.some((h) => h.sent > 0) && (
            <section><h4>By hour sent (UTC)</h4>
              <div className="ox-days ox-hours">{s.hours.map((h) => <div key={h.hour} title={`${h.hour}:00 — ${h.sent} sent, ${h.replied} answered`}><i style={{ height: `${(h.sent / Math.max(1, ...s.hours!.map((x) => x.sent))) * 100}%` }}><b style={{ height: h.sent ? `${(h.replied / h.sent) * 100}%` : 0 }} /></i><span>{h.hour % 6 === 0 ? h.hour : ""}</span></div>)}</div>
              <p className="ox-hint">{s.bestHours && s.bestHours.length ? `Best hours so far: ${s.bestHours.map((h) => `${h}:00`).join(", ")}.` : "Needs about 30 mails before it names a best hour."}</p></section>
          )}
          {s.answers && s.answers.length > 0 && (
            <section><h4>How long answers take</h4>
              <ul className="ox-plain">{s.answers.map((a) => <li key={a.name}>{a.name}: median <b>{a.median}</b> day{a.median === 1 ? "" : "s"} <small className="ox-dim">({a.n} answers)</small></li>)}</ul>
              {s.quietAfter && <p className="ox-hint">“Gone quiet” starts after {s.quietAfter} days, from these medians.</p>}</section>
          )}
          {s.reasons && s.reasons.length > 0 && (
            <section><h4>Why they said no</h4><p className="ox-chips-lite">{s.reasons.map((r) => <span key={r.reason} className="ox-tag">{r.reason} · {r.n}</span>)}</p></section>
          )}
          {(profile.yearlyBudget != null || fees.paidCalls > 0) && (
            <section><h4>Fees this year</h4><p>{fees.spent} spent on {fees.paidCalls} paid call{fees.paidCalls === 1 ? "" : "s"}{fees.left !== null && <> · <b className={fees.over ? "ox-due" : ""}>{fees.over ? `${-fees.left} over budget` : `${fees.left} left`}</b></>}.</p></section>
          )}
          {acc.length > 0 && (
            <section><h4>Mails that were accepted</h4>
              <ul className="ox-plain">{acc.slice(0, 8).map((a) => <li key={a.contactId}><b>{a.who}</b> · {a.subject} <button className="btn-link" onClick={() => keep(a)}>Use as template</button></li>)}</ul></section>
          )}
          {links.length > 0 && (
            <section><h4>Link clicks</h4>
              <ul className="ox-plain">{links.slice(0, 8).map((l) => <li key={l.code}><b>{l.clicks}</b> · <span className="ox-clip" title={l.url}>{l.url}</span></li>)}</ul></section>
          )}
          {s.overall.people < 15 && <p className="ox-hint">Under 15 people so far: treat these numbers as stories, not proof.</p>}
        </div>
      )}
    </details>
  );
}
