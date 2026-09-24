import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { useToastStore } from "../../lib/toastStore";

interface Entry {
  id: number;
  points: number;
  reason: string;
  createdAt: string;
  user: { username: string };
}
interface Total {
  userId: number;
  username: string;
  total: number;
}

export function ContributorPointsAdminPage() {
  useDocumentTitle("Contributor points");
  const [totals, setTotals] = useState<Total[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [username, setUsername] = useState("");
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");

  function load() {
    api<{ totals: Total[]; entries: Entry[] }>("/api/admin/contributor-points").then((data) => {
      setTotals(data.totals);
      setEntries(data.entries);
    });
  }
  useEffect(load, []);

  async function award(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !points || !reason.trim()) return;
    try {
      const user = await api<{ id: number }>(`/api/users/${username.trim()}`);
      await api("/api/admin/contributor-points", { method: "POST", body: JSON.stringify({ userId: user.id, points: Number(points), reason: reason.trim() }) });
      setUsername("");
      setPoints("");
      setReason("");
      useToastStore.getState().showToast("Points awarded ✓");
      load();
    } catch (err) {
      useToastStore.getState().showToast(err instanceof Error ? err.message : "Failed to award points");
    }
  }

  async function removeEntry(id: number) {
    await api(`/api/admin/contributor-points/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <h1>Contributor points</h1>
      <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
        Admin-only. 10 points are awarded automatically when a branch submission is approved; award more manually
        for anything else.
      </p>

      <form onSubmit={award} style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", margin: "0.8rem 0" }}>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
        <input value={points} onChange={(e) => setPoints(e.target.value)} placeholder="Points" type="number" style={{ width: 90 }} />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" style={{ flex: 1, minWidth: 160 }} />
        <button className="btn btn-primary" type="submit">
          Award
        </button>
      </form>

      <h2 style={{ fontSize: "1rem" }}>Leaderboard</h2>
      <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse", marginBottom: "1.5rem" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>User</th>
            <th style={{ textAlign: "left" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {totals.map((t) => (
            <tr key={t.userId} style={{ borderTop: "1px solid var(--border)" }}>
              <td>{t.username}</td>
              <td>{t.total}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize: "1rem" }}>History</h2>
      <table style={{ width: "100%", fontSize: "0.82rem", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>User</th>
            <th style={{ textAlign: "left" }}>Points</th>
            <th style={{ textAlign: "left" }}>Reason</th>
            <th style={{ textAlign: "left" }}>Date</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} style={{ borderTop: "1px solid var(--border)" }}>
              <td>{e.user.username}</td>
              <td>{e.points}</td>
              <td>{e.reason}</td>
              <td style={{ color: "var(--text-dim)" }}>{new Date(e.createdAt).toLocaleDateString()}</td>
              <td>
                <button className="btn btn-danger" style={{ fontSize: "0.72rem" }} onClick={() => removeEntry(e.id)}>
                  remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
