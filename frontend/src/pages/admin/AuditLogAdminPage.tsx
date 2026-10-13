import { useEffect, useState } from "react";
import { api, getToken } from "../../lib/api";
import { useToastStore } from "../../lib/toastStore";

interface LogEntry {
  id: number;
  action: string;
  targetType: string;
  targetId: number | null;
  createdAt: string;
  actor: { username: string };
}

export function AuditLogAdminPage() {
  const [query, setQuery] = useState("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [entries, setEntries] = useState<LogEntry[]>([]);

  const qs = () => new URLSearchParams(Object.entries({ q: query, actor, from, to }).filter(([, v]) => v)).toString();
  // Typing waits a beat so a fast typist sends one request, not one per key.
  useEffect(() => {
    const t = setTimeout(() => { api<LogEntry[]>(`/api/admin/audit-log?${qs()}`).then((r) => setEntries(Array.isArray(r) ? r : [])).catch(() => setEntries([])); }, 250);
    return () => clearTimeout(t);
  }, [query, actor, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  async function exportCsv() {
    const res = await fetch(`/api/admin/audit-log.csv?${qs()}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) return useToastStore.getState().showToast("Export failed");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = "action-log.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function handleClear() {
    if (!confirm("Clear the entire admin action log? This cannot be undone.")) return;
    await api("/api/admin/audit-log", { method: "DELETE" });
    setEntries([]);
  }

  return (
    <div>
      <h1>Admin action log</h1>
      <div style={{ display: "flex", gap: "0.6rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <input
          placeholder="Search by action, target type, or admin…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 320 }}
          aria-label="Search"
        />
        <input placeholder="Admin" value={actor} onChange={(e) => setActor(e.target.value)} style={{ maxWidth: 130 }} aria-label="Admin" />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        <button className="btn" onClick={exportCsv} data-testid="audit-export">Export CSV</button>
        <button className="btn btn-danger" onClick={handleClear}>
          Clear log
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Admin</th>
            <th>Action</th>
            <th>Target</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="mono" style={{ fontSize: "0.8rem" }}>
                {new Date(e.createdAt).toLocaleString()}
              </td>
              <td>{e.actor.username}</td>
              <td className="mono">{e.action}</td>
              <td className="mono">
                {e.targetType}
                {e.targetId ? ` #${e.targetId}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length === 0 && <p style={{ color: "var(--text-dim)" }}>Nothing logged yet.</p>}
    </div>
  );
}
