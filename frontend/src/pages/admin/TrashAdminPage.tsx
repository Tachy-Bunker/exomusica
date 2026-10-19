import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { Loading } from "../../components/Loading";

interface TrashRow { id: number; text: string; kind: string; author: string; channel: { slug: string; name: string }; files: number; deletedAt: string; daysLeft: number }
interface ItemRow { id: number; type: "room" | "prefab" | "theme" | "corridor" | "picture"; label: string; deletedAt: string; daysLeft: number }
const TYPE_LABEL: Record<ItemRow["type"], string> = { room: "Room", prefab: "Prefab", theme: "Theme", corridor: "Corridor", picture: "Picture" };

export function TrashAdminPage() {
  useDocumentTitle("Trash");
  const [rows, setRows] = useState<TrashRow[] | null>(null);
  const load = () => api<TrashRow[]>("/api/admin/trash").then((r) => setRows(Array.isArray(r) ? r : [])).catch(() => setRows([]));
  useEffect(() => { void load(); }, []);
  // rooms, prefabs, themes and pictures (P35): kept 30 days, restorable here
  const [items, setItems] = useState<ItemRow[] | null>(null), [itemMsg, setItemMsg] = useState("");
  const loadItems = () => api<ItemRow[]>("/api/admin/trash/items").then((r) => setItems(Array.isArray(r) ? r : [])).catch(() => setItems([]));
  useEffect(() => { void loadItems(); }, []);
  async function restoreItem(id: number) {
    setItemMsg("");
    try { await api(`/api/admin/trash/items/${id}/restore`, { method: "POST" }); setItemMsg("Restored."); }
    catch (e) { setItemMsg(e instanceof Error ? e.message : "Could not restore."); }
    void loadItems();
  }
  async function purgeItem(id: number) {
    if (!confirm("Delete this for good? It can't be restored after this.")) return;
    setItemMsg("");
    try { await api(`/api/admin/trash/items/${id}/purge`, { method: "POST" }); } catch (e) { setItemMsg(e instanceof Error ? e.message : "Could not delete."); }
    void loadItems();
  }

  async function restore(id: number) { await api(`/api/messages/${id}/restore`, { method: "POST" }); void load(); }
  async function purge(id: number) {
    if (!confirm("Delete this message and its files for good? It can't be restored after this.")) return;
    await api(`/api/admin/trash/${id}/purge`, { method: "POST" }); void load();
  }

  return (
    <div data-testid="trash-page">
      <h1>Trash</h1>
      <p className="home-dim" style={{ fontSize: "0.85rem" }}>Deleted messages stay here for 30 days with their files, then are cleared automatically. Restoring puts the message back in its room.</p>
      {rows === null ? <Loading /> : rows.length === 0 ? <p className="home-dim" data-testid="trash-empty">The trash is empty.</p> : (
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
      <h2 style={{ marginTop: "2rem" }}>Rooms, prefabs, themes and pictures</h2>
      <p className="home-dim" style={{ fontSize: "0.85rem" }}>Deleted rooms come back with their saved versions. A deleted picture comes back under its own number, so the rooms that use it show it again. Both stay for 30 days.</p>
      {itemMsg && <p className="home-dim" data-testid="trash-itemsmsg">{itemMsg}</p>}
      {items === null ? <Loading /> : items.length === 0 ? <p className="home-dim" data-testid="trash-items-empty">Nothing else is in the trash.</p> : (
        <table>
          <thead><tr><th>Item</th><th>Type</th><th>Left</th><th /></tr></thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} data-testid="trash-item-row">
                <td>{r.label}</td>
                <td>{TYPE_LABEL[r.type] ?? r.type}</td>
                <td className="mono">{r.daysLeft} d</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn" data-testid={`trash-item-restore-${r.id}`} onClick={() => restoreItem(r.id)}>Restore</button>{" "}
                  <button className="btn btn-danger" data-testid={`trash-item-purge-${r.id}`} onClick={() => purgeItem(r.id)}>Delete now</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
