import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { Loading } from "../../components/Loading";

interface Brief { source: "written" | "temporary"; title: string; brief: string; rule: string; trackId: number | null; goalUnits: number }
interface MonthView { month: string; brief: Brief | null; written: boolean; trackTitle: string | null; units: number; down: boolean }
interface Archive { month: string; title: string; trackId: number | null; goalUnits: number; downAt: string | null }
interface AdminMonthly { openMonth: string | null; current: string; months: MonthView[]; archive: Archive[] }

/** The monthly boss: this month and next are written by hand. The first three months of the challenge start from a temporary brief until you save one. */
export function MonthlyAdminPage() {
  const [data, setData] = useState<AdminMonthly | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<AdminMonthly>("/api/admin/monthly").then(setData).catch(() => setData(null)); }, []);
  if (!data) return <Loading />;
  return (
    <div data-testid="monthly-admin">
      <h2>Monthly challenge</h2>
      <p className="home-dim">{data.openMonth ? `The challenge opened in ${data.openMonth}.` : "The challenge is not open yet: it opens when the community reaches its milestone. You can write a month's brief in advance."} The bar is listening minutes to the boss track plus five units per room run. Boss track: the number of the track (its id).</p>
      {error && <p role="alert" className="error">{error}</p>}
      {data.months.map((m) => <MonthForm key={m.month} view={m} onSaved={(next) => setData((d) => d && { ...d, months: d.months.map((x) => (x.month === next.month ? next : x)) })} onError={setError} />)}
      <h3>Archive</h3>
      {data.archive.length === 0 ? <p className="home-dim">No written briefs yet.</p> : (
        <table className="admin-table" style={{ width: "100%" }}>
          <thead><tr><th>Month</th><th>Boss</th><th>Goal</th><th>Down</th></tr></thead>
          <tbody>{data.archive.map((a) => <tr key={a.month}><td>{a.month}</td><td>{a.title}</td><td>{a.goalUnits.toLocaleString()}</td><td>{a.downAt ? new Date(a.downAt).toLocaleDateString() : "still standing"}</td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}

function MonthForm({ view, onSaved, onError }: { view: MonthView; onSaved: (m: MonthView) => void; onError: (e: string | null) => void }) {
  const b = view.brief;
  const [form, setForm] = useState({ title: b?.title ?? "", brief: b?.brief ?? "", rule: b?.rule ?? "", trackId: b?.trackId != null ? String(b.trackId) : "", goalUnits: b ? String(b.goalUnits) : "300" });
  const [busy, setBusy] = useState(false);
  const status = view.written ? "Written" : b ? "Temporary text: save it to make it this month's" : "No brief yet";

  async function save() {
    onError(null); setBusy(true);
    try {
      const body = { title: form.title, brief: form.brief, rule: form.rule, trackId: form.trackId.trim() === "" ? null : Number(form.trackId), goalUnits: Number(form.goalUnits) };
      const res = await api<AdminMonthly>(`/api/admin/monthly/${view.month}`, { method: "PUT", body: JSON.stringify(body) });
      const next = res.months.find((m) => m.month === view.month);
      if (next) onSaved(next);
    } catch (e) { onError(e instanceof ApiError ? e.message : "Couldn't save"); }
    finally { setBusy(false); }
  }

  return (
    <fieldset data-testid={`monthly-admin-${view.month}`} style={{ margin: "0.8rem 0", padding: "0.6rem" }}>
      <legend><b>{view.month}</b> · {status}{view.down && " · down"}</legend>
      <div style={{ display: "grid", gap: "0.4rem", gridTemplateColumns: "minmax(0,1fr) minmax(0,10rem)" }}>
        <label>Boss title<br /><input value={form.title} maxLength={80} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ width: "100%" }} /></label>
        <label>Goal (units)<br /><input type="number" min={1} step={1} value={form.goalUnits} onChange={(e) => setForm({ ...form, goalUnits: e.target.value })} style={{ width: "100%" }} /></label>
        <label style={{ gridColumn: "1 / -1" }}>Brief<br /><textarea rows={3} maxLength={1200} value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} style={{ width: "100%" }} /></label>
        <label style={{ gridColumn: "1 / -1" }}>Rule (optional)<br /><input value={form.rule} maxLength={400} onChange={(e) => setForm({ ...form, rule: e.target.value })} style={{ width: "100%" }} /></label>
        <label>Boss track (id)<br /><input type="number" min={1} step={1} value={form.trackId} onChange={(e) => setForm({ ...form, trackId: e.target.value })} style={{ width: "100%" }} placeholder="empty = no track yet" /></label>
        <div style={{ alignSelf: "end" }}>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()} data-testid={`monthly-save-${view.month}`}>Save</button>
          <span className="home-dim" style={{ marginLeft: "0.5rem" }}>{view.units.toLocaleString()} units so far{view.trackTitle ? ` · ${view.trackTitle}` : ""}</span>
        </div>
      </div>
    </fieldset>
  );
}
