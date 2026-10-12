import { useMemo, useState } from "react";
import { api } from "../../lib/api";
import { applyStrategy, buildMergeRows, findDuplicates, pickKeeper, STRATEGY_LABEL, toMergeBody, type Choices, type MergeCandidate, type Strategy } from "../../lib/outreachDup";
import { STATUS_LABEL, type Col, type Contact, type Group } from "./types";

const show = (v: MergeCandidate["value"], kind: string): string => {
  if (kind === "place") { const p = (v ?? { place: "", lat: null }) as { place: string; lat: number | null }; return p.place ? `${p.place}${p.lat !== null ? " 📍" : ""}` : ""; }
  if (Array.isArray(v)) return v.join(", "); if (v === null || v === undefined || v === "") return ""; if (typeof v === "boolean") return v ? "yes" : "";
  return kind === "status" ? STATUS_LABEL[String(v)] ?? String(v) : String(v);
};

/** The same call or person twice: pick the record to keep, decide every field (or use a preset), merge. Mail history moves to the survivor. */
export function MergeModal({ contacts, cols, groups, onMerged, onClose }: { contacts: Contact[]; cols: Col[]; groups: Group[]; onMerged: (kept: Contact, removed: number[]) => void; onClose: () => void }) {
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(0);
  const all = useMemo(() => findDuplicates(contacts, cols), [contacts, cols]);
  const queue = all.filter((g) => !skipped.has(g.ids.join(",")));
  const g = queue[0] ?? null;
  const members = useMemo(() => (g ? g.ids.map((id) => contacts.find((c) => c.id === id)).filter((c): c is Contact => !!c) : []), [g, contacts]);
  const rows = useMemo(() => buildMergeRows(members, cols, groups), [members, cols, groups]);
  const order = useMemo(() => members.map((m) => m.id).sort((a, b) => a - b), [members]);
  const [keep, setKeep] = useState<number | null>(null);
  const [choices, setChoices] = useState<Choices>({});
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const key = g?.ids.join(",") ?? "";
  const [seen, setSeen] = useState("");
  if (g && seen !== key) { setSeen(key); setKeep(pickKeeper(members)); setChoices(applyStrategy(rows, "combine", order)); setErr(""); }

  const preset = (s: Strategy) => setChoices(applyStrategy(rows, s, order));
  const pickCandidate = (field: string, c: MergeCandidate) => setChoices((x) => ({ ...x, [field]: c.value }));
  const isChosen = (field: string, c: MergeCandidate) => JSON.stringify(choices[field]) === JSON.stringify(c.value);
  async function merge() {
    if (!g || keep === null) return; setBusy(true); setErr("");
    try {
      const r = await api<{ contact: Contact; removed: number[] }>("/api/outreach/contacts/merge", { method: "POST", body: JSON.stringify(toMergeBody(keep, g.ids, choices, groups)) });
      onMerged(r.contact, r.removed); setDone((n) => n + 1);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't merge."); }
    setBusy(false);
  }

  return (
    <div className="ox-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ox-modal ox-wide" role="dialog" aria-label="Merge duplicates">
        <header><h2>Duplicates</h2><button className="btn" onClick={onClose} aria-label="Close">✕</button></header>
        {!g ? <p className="ox-ok">{done ? `Merged ${done} group${done === 1 ? "" : "s"}. ` : ""}{all.length === 0 ? "No duplicates found: nobody shares an address, a name or a web page." : "Nothing left to merge."}</p> : (
          <>
            <p className="ox-hint">{queue.length} group{queue.length === 1 ? "" : "s"} to look at. This one: <b>{g.reasons.join(", ")}</b>{g.weak ? " (weak: different people can work at one place; only merge if it is the same one)" : ""}. Sends, scheduled mail and mail history move to the record you keep.</p>
            <div className="ox-bar">
              <span className="ox-lbl">Keep record</span>
              {members.map((m) => <label key={m.id} className="ox-check"><input type="radio" name="keep" checked={keep === m.id} onChange={() => setKeep(m.id)} /> {m.name || m.email || `#${m.id}`} <small className="ox-dim">#{m.id}{m.sentCount ? ` · ${m.sentCount} sent` : ""}</small></label>)}
            </div>
            <div className="ox-bar" role="group" aria-label="Quick merge">
              <span className="ox-lbl">Fill every field with</span>
              {(Object.keys(STRATEGY_LABEL) as Strategy[]).map((s) => <button key={s} className="btn" onClick={() => preset(s)} title={{ newest: "The newest record's value for each field (a date: the latest)", complete: "The longest / largest value for each field", combine: "Both texts joined, lists and counts added, the furthest status", oldest: "The oldest record's value for each field" }[s]}>{STRATEGY_LABEL[s]}</button>)}
            </div>
            <div className="ox-scroll"><table className="ox-table ox-merge">
              <thead><tr><th>Field</th>{members.map((m) => <th key={m.id}>#{m.id} {m.name || m.email}</th>)}<th>Result</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.field} className={r.same ? "same" : ""}>
                  <th scope="row">{r.label}</th>
                  {members.map((m) => { const c = r.candidates.find((x) => x.id === m.id) as MergeCandidate; const t = show(c.value, r.kind); return (
                    <td key={m.id} className={isChosen(r.field, c) ? "on" : ""}>{r.same ? <span className="ox-dim">{t}</span> : <label className="ox-opt"><input type="radio" name={r.field} checked={isChosen(r.field, c)} onChange={() => pickCandidate(r.field, c)} disabled={t === ""} aria-label={`${r.label} from #${m.id}`} /> <span className={r.kind === "long" ? "ox-clip" : ""}>{t || <em className="ox-dim">empty</em>}</span></label>}</td>
                  ); })}
                  <td className="ox-result">{show(choices[r.field] as MergeCandidate["value"], r.kind) || <em className="ox-dim">empty</em>}</td>
                </tr>
              ))}</tbody>
            </table></div>
            {err && <p className="ox-err" role="alert">{err}</p>}
            <footer>
              <button className="btn" onClick={() => setSkipped(new Set([...skipped, key]))}>Not a duplicate: skip</button>
              <button className="btn btn-primary" onClick={merge} disabled={busy || keep === null}>{busy ? "Merging…" : `Merge ${members.length} into one`}</button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
