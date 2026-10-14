import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Avatar } from "../../components/Avatar";
import { UserEditor, type UserDetail } from "../../components/admin/UserEditor";
import { useAuth } from "../../lib/auth";

interface UserSummary {
  id: number;
  username: string;
  isAdmin: boolean;
  isGhost: boolean;
  discordId?: string | null;
  linkedUserId?: number | null;
  linkedUser?: { id: number; username: string } | null;
  _count?: { messages: number };
  createdAt: string;
  storageUsedBytes: number;
  storageLimitBytes: number;
}


export function UsersPage() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 50;
  const [ghosts, setGhosts] = useState<UserSummary[]>([]);
  const [mergeTargets, setMergeTargets] = useState<Record<number, string>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user: me } = useAuth();

  function load() {
    api<{ users: UserSummary[]; total: number }>(`/api/admin/users?q=${encodeURIComponent(query)}&page=${page}`).then((r) => {
      setUsers(r.users);
      setTotal(r.total);
    });
  }

  function loadGhosts() {
    api<{ users: UserSummary[] }>("/api/admin/users?ghostsOnly=true").then((r) => setGhosts(r.users));
  }

  useEffect(load, [query, page]);
  useEffect(loadGhosts, []);
  useEffect(() => setPage(1), [query]); // a new search should always start back at page 1

  async function linkGhost(ghostId: number) {
    const targetUsername = mergeTargets[ghostId]?.trim();
    if (!targetUsername) return;
    const { users: matches } = await api<{ users: UserSummary[] }>(`/api/admin/users?q=${encodeURIComponent(targetUsername)}`);
    const target = matches.find((u) => u.username.toLowerCase() === targetUsername.toLowerCase());
    if (!target) {
      alert(`No account found with username "${targetUsername}" - check the spelling.`);
      return;
    }
    await api(`/api/admin/users/${ghostId}/link-ghost`, { method: "POST", body: JSON.stringify({ targetUserId: target.id }) });
    loadGhosts();
  }

  async function unlinkGhost(ghostId: number) {
    if (!confirm("Unlink this ghost? Its messages will show under its own name again.")) return;
    await api(`/api/admin/users/${ghostId}/unlink-ghost`, { method: "POST" });
    loadGhosts();
  }

  async function handleGhost(user: UserSummary) {
    if (!confirm(`Ghost ${user.username}? Their messages stay, but the account can no longer log in.`)) return;
    await api(`/api/admin/users/${user.id}`, { method: "DELETE" });
    load();
  }

  async function startEdit(u: UserSummary) {
    setError(null);
    const full = await api<UserDetail>(`/api/admin/users/${u.id}`);
    setDetail(full);
    setEditingId(u.id);
  }

  return (
    <div>
      <h1>Users</h1>

      {ghosts.length > 0 && (
        <div style={{ marginBottom: "1.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.8rem" }}>
          <h2 style={{ fontSize: "1rem", marginTop: 0 }}>Ghost accounts ({ghosts.length})</h2>
          <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
            Created by Discord import - can't log in. Linking one to a real account resolves its messages,
            mentions, and exports as that account from now on - this is a persistent link, not a one-time merge, so
            it keeps working for anything a future Discord bot bridge sends under the same author id too.
          </p>
          {ghosts.map((g) => (
            <div key={g.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ minWidth: 140 }}>{g.username}</span>
              <span className="mono" style={{ fontSize: "0.7rem", color: "var(--text-dim)", minWidth: 130 }} title="Discord author ID">
                {g.discordId ?? "-"}
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-dim)", minWidth: 90 }}>{g._count?.messages ?? 0} messages</span>
              {g.linkedUser ? (
                <>
                  <span style={{ fontSize: "0.85rem", color: "var(--accent-audio)" }}>Linked to {g.linkedUser.username}</span>
                  <button className="btn btn-danger" onClick={() => unlinkGhost(g.id)}>
                    Unlink
                  </button>
                </>
              ) : (
                <>
                  <input
                    placeholder="target username"
                    value={mergeTargets[g.id] ?? ""}
                    onChange={(e) => setMergeTargets((prev) => ({ ...prev, [g.id]: e.target.value }))}
                    style={{ fontSize: "0.85rem" }}
                  />
                  <button className="btn btn-primary" onClick={() => linkGhost(g.id)}>
                    Link
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <input
        placeholder="Search by username…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: "1rem", maxWidth: 300 }}
      />
      {total > pageSize && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
          <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Prev
          </button>
          <span>
            Page {page} of {Math.ceil(total / pageSize)} ({total} users total)
          </span>
          <button className="btn" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage((p) => p + 1)}>
            Next →
          </button>
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>Status</th>
            <th>Storage</th>
            <th>Joined</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <>
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.isGhost ? "ghost" : u.isAdmin ? "admin" : "active"}</td>
                <td className="mono" style={{ fontSize: "0.8rem" }}>
                  {u.isGhost ? "-" : u.isAdmin ? "unlimited" : `${(u.storageUsedBytes / 1024 / 1024).toFixed(1)} / ${(u.storageLimitBytes / 1024 / 1024).toFixed(0)}MB`}
                </td>
                <td className="mono">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {!u.isGhost && (
                    <button className="btn" onClick={() => startEdit(u)}>
                      Manage
                    </button>
                  )}{" "}
                  {!u.isGhost && !u.isAdmin && (
                    <button className="btn btn-danger" onClick={() => handleGhost(u)}>
                      Ghost
                    </button>
                  )}
                </td>
              </tr>
              {editingId === u.id && detail && (
                <tr>
                  <td colSpan={4}>
                    <UserEditor initial={detail} selfId={me?.id} onSaved={load} onClose={() => { setEditingId(null); setDetail(null); }} />
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
