import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useDocumentTitle } from "../../lib/useDocumentTitle";

interface TrashRow { id: number; text: string; kind: string; author: string; channel: { slug: string; name: string }; files: number; deletedAt: string; daysLeft: number }

export function TrashAdminPage() {
  useDocumentTitle("Trash");
  const [rows, setRows] = useState<TrashRow[] | null>(null);
  const load = () => api<TrashRow[]>("/api/admin/trash").then((r) => setRows(Array.isArray(r) ? r : [])).catch(() => setRows([]));
  useEffect(() => { void load(); }, []);

  async function restore(id: number) { await api(`/api/messages/${id}/restore`, { method: "POST" }); void load(); }
  async function purge(id: number) {
    if (!confirm("Delete this message and its files for good? It can't be restored after this.")) return;
    await api(`/api/admin/trash/${id}/purge`, { method: "POST" }); void load();
  }

  return (
    <div data-testid="trash-page">
      <h1>Trash</h1>
      <p className="home-dim" style={{ fontSize: "0.85rem" }}>Deleted messages stay here for 30 days with their files, then are cleared automatically. Restoring puts the message back in its room.</p>
      {rows === null ? <p className="home-dim">Loading…</p> : rows.length === 0 ? <p className="home-dim" data-testid="trash-empty">The trash is empty.</p> : (
        <table>
          <thead><tr><th>Message</th><th>Room</th><th>Left</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid="trash-row">
                <td><b>{r.author}</b>: {r.text || <em className="home-dim">({r.kind})</em>}{r.files > 0 && <span className="home-dim"> · {r.files} file{r.files > 1 ? "s" : ""}</span>}</td>
                <td><Link to={`/topic/${r.channel.slug}`}>{r.channel.name}</Link></td>
                <td className="mono">{r.daysLeft} d</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn" onClick={() => restore(r.id)}>Restore</button>{" "}
                  <button className="btn btn-danger" onClick={() => purge(r.id)}>Purge</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
