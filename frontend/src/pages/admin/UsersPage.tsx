import { useEffect, useState } from "react";
import { api } from "../../lib/api";

interface UserSummary {
  id: number;
  username: string;
  isAdmin: boolean;
  isGhost: boolean;
  createdAt: string;
}

export function UsersPage() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserSummary[]>([]);

  function load(q: string) {
    api<UserSummary[]>(`/api/admin/users?q=${encodeURIComponent(q)}`).then(setUsers);
  }

  useEffect(() => load(""), []);

  async function handleGhost(user: UserSummary) {
    if (!confirm(`Ghost ${user.username}? Their messages stay, but the account can no longer log in.`)) return;
    await api(`/api/admin/users/${user.id}`, { method: "DELETE" });
    load(query);
  }

  return (
    <div>
      <h1>Users</h1>
      <input
        placeholder="Search by username…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          load(e.target.value);
        }}
        style={{ marginBottom: "1rem", maxWidth: 300 }}
      />
      <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>Status</th>
            <th>Joined</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.username}</td>
              <td>{u.isGhost ? "ghost" : u.isAdmin ? "admin" : "active"}</td>
              <td className="mono">{new Date(u.createdAt).toLocaleDateString()}</td>
              <td>
                {!u.isGhost && !u.isAdmin && (
                  <button className="btn btn-danger" onClick={() => handleGhost(u)}>
                    Ghost
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
