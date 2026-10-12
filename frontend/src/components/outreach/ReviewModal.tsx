export interface ReviewRow { id: number; to: string; email: string; subject: string; greeting: string; missing: string[]; hasEmail: boolean; groups: string[]; variant?: "A" | "B" | null; notes?: string[] }
const ORGISH = /\b(festival|records|label|collective|team|info|contact|office|gallery|studio|ltd|gmbh|inc|booking|programme|program|association|asbl)\b/i;
export const flagsOf = (r: ReviewRow): string[] => [
  ...(r.notes ?? []),
  ...(r.hasEmail ? [] : ["no email address"]),
  ...(r.missing.length ? [`empty: ${r.missing.map((m) => `{{${m}}}`).join(", ")}`] : []),
  ...(ORGISH.test(r.greeting.split(/[,\n]/)[0]) ? ["the greeting reads like an organisation, not a person"] : []),
  ...(/\{\{|\}\}/.test(r.greeting) ? ["an unfilled {{field}} shows"] : []),
];

/** Every person's actual opening line and subject, side by side, with the ones that look wrong marked. */
export function ReviewModal({ rows, onClose, onSend }: { rows: ReviewRow[]; onClose: () => void; onSend: () => void }) {
  const bad = rows.filter((r) => flagsOf(r).length > 0).length;
  return (
    <div className="ox-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ox-modal ox-wide" role="dialog" aria-label="Review every message">
        <header><h2>Review every message</h2><button className="btn" onClick={onClose} aria-label="Close">✕</button></header>
        <p className="ox-hint">{rows.length} messages. {bad ? `${bad} need a look.` : "Nothing looks wrong."} Each row shows what that person will read first.</p>
        <div className="ox-scroll"><table className="ox-table ox-review"><thead><tr><th>To</th><th>Subject</th><th>Opens with</th><th>Check</th></tr></thead><tbody>
          {rows.map((r) => { const f = flagsOf(r); return <tr key={r.id} className={f.length ? "due" : ""}><td><b>{r.to}</b><br /><small className="ox-dim">{r.email}{r.groups.length ? ` · ${r.groups.join(", ")}` : ""}</small></td><td>{r.variant && <b>{r.variant}: </b>}{r.subject}</td><td>{r.greeting}</td><td>{f.length ? f.map((x) => <span key={x} className="ox-flag">⚠ {x}</span>) : <span className="ox-ok">✓</span>}</td></tr>; })}
        </tbody></table></div>
        <footer><button className="btn" onClick={onClose}>Back and fix</button><button className="btn btn-primary" onClick={onSend}>{bad ? "Send anyway" : "Looks right: send"}</button></footer>
      </div>
    </div>
  );
}
