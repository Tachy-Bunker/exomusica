import { useEffect, useState } from "react";
import { api } from "../../lib/api";

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
  const [entries, setEntries] = useState<LogEntry[]>([]);

  function load(q: string) {
    api<LogEntry[]>(`/api/admin/audit-log?q=${encodeURIComponent(q)}`).then(setEntries);
  }
  useEffect(() => load(""), []);

  async function handleClear() {
    if (!confirm("Clear the entire admin action log? This cannot be undone.")) return;
    await api("/api/admin/audit-log", { method: "DELETE" });
    load(query);
  }

  return (
    <div>
      <h1>Admin action log</h1>
      <div style={{ display: "flex", gap: "0.6rem", marginBottom: "1rem" }}>
        <input
          placeholder="Search by action, target type, or admin…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            load(e.target.value);
          }}
          style={{ maxWidth: 320 }}
        />
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
