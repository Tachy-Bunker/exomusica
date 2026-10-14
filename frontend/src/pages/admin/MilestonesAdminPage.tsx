import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { forgetMilestones } from "../../lib/milestones";
import { Loading } from "../../components/Loading";

interface Row {
  key: string; title: string; perk: string; metric: string; label: string;
  target: number; defaultTarget: number; enabled: boolean; now: number; reached: boolean; live: boolean;
}

/** Community milestones: the numbers at which something opens for everyone. Change a target, or switch one off. News can show them with @milestone(key) and {{MTARGET:key}}. */
export function MilestonesAdminPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  useEffect(() => { api<Row[]>("/api/admin/milestones").then(setRows).catch(() => setRows([])); }, []);

  async function save(key: string, body: { target?: number | null; enabled?: boolean }) {
    setError(null);
    try {
      const next = await api<Row>(`/api/admin/milestones/${key}`, { method: "PUT", body: JSON.stringify(body) });
      forgetMilestones();
      setRows((r) => r && r.map((x) => (x.key === key ? { ...x, ...next } : x)));
      setDraft((d) => { const { [key]: _gone, ...rest } = d; return rest; });
      setSavedKey(key);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Couldn't save"); }
  }
  if (!rows) return <Loading />;
  return (
    <div data-testid="milestones-admin">
      <h2>Milestones</h2>
      <p className="home-dim">When the whole community reaches a number, something opens for everyone. Counts refresh once a minute. A milestone marked <i>reward being built</i> still counts and shows, but nothing happens yet beyond the announcement.</p>
      <p className="home-dim" style={{ fontSize: "0.85rem" }}>In News: a line <code>@milestone(m-tracks)</code> draws its card, <code>@milestones</code> the three closest. In titles and text: <code>{"{{MNOW:m-tracks}}"}</code> out of <code>{"{{MTARGET:m-tracks}}"}</code>.</p>
      {error && <p role="alert" className="error">{error}</p>}
      <table className="admin-table" style={{ width: "100%" }}>
        <thead><tr><th>Milestone</th><th>Counts</th><th>Now</th><th>Target</th><th>On</th></tr></thead>
        <tbody>
          {rows.map((m) => {
            const value = draft[m.key] ?? String(m.target);
            const changed = Number(value) !== m.target;
            return (
              <tr key={m.key} data-testid={`ms-${m.key}`} style={m.enabled ? undefined : { opacity: 0.5 }}>
                <td><b>{m.title}</b> {!m.live && <span className="home-dim" style={{ fontSize: "0.75rem" }}>(reward being built)</span>}<br /><span className="home-dim" style={{ fontSize: "0.8rem" }}>{m.perk}</span><br /><code style={{ fontSize: "0.75rem" }}>{m.key}</code></td>
                <td>{m.label}</td>
                <td>{m.now.toLocaleString()}{m.reached && " ✓"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <input type="number" min={1} step={1} style={{ width: "6.5rem" }} value={value} aria-label={`Target for ${m.title}`} onChange={(e) => setDraft((d) => ({ ...d, [m.key]: e.target.value }))} />
                  {changed && <button type="button" className="btn btn-primary" style={{ marginLeft: "0.3rem" }} onClick={() => void save(m.key, { target: Number(value) })} data-testid={`ms-save-${m.key}`}>Save</button>}
                  {m.target !== m.defaultTarget && <button type="button" className="btn" style={{ marginLeft: "0.3rem" }} title={`Default ${m.defaultTarget.toLocaleString()}`} onClick={() => void save(m.key, { target: null })} data-testid={`ms-reset-${m.key}`}>Default ({m.defaultTarget.toLocaleString()})</button>}
                  {savedKey === m.key && !changed && <span role="status" className="home-dim"> Saved</span>}
                </td>
                <td><input type="checkbox" checked={m.enabled} aria-label={`${m.title} on`} onChange={(e) => void save(m.key, { enabled: e.target.checked })} data-testid={`ms-on-${m.key}`} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
