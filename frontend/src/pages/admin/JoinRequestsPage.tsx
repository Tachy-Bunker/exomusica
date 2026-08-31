import { useEffect, useState } from "react";
import { api } from "../../lib/api";

interface JoinRequest {
  id: number;
  username: string;
  email: string;
  bio: string | null;
  reason: string;
  createdAt: string;
}

export function JoinRequestsPage() {
  const [requests, setRequests] = useState<JoinRequest[]>([]);

  function load() {
    api<JoinRequest[]>("/api/admin/join-requests").then(setRequests);
  }

  useEffect(load, []);

  async function decide(id: number, action: "approve" | "reject") {
    await api(`/api/admin/join-requests/${id}/${action}`, { method: "POST" });
    load();
  }

  return (
    <div>
      <h1>Join requests</h1>
      {requests.length === 0 && <p style={{ color: "var(--text-dim)" }}>Nothing pending.</p>}
      {requests.map((r) => (
        <div key={r.id} className="btn" style={{ cursor: "default", textAlign: "left", marginBottom: "0.8rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <strong>{r.username}</strong>
            <span className="mono" style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
              {new Date(r.createdAt).toLocaleDateString()}
            </span>
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>{r.email}</div>
          {r.bio && <p style={{ fontSize: "0.85rem" }}>{r.bio}</p>}
          <p style={{ fontSize: "0.85rem" }}>
            <em>{r.reason}</em>
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn btn-primary" onClick={() => decide(r.id, "approve")}>
              Approve
            </button>
            <button className="btn btn-danger" onClick={() => decide(r.id, "reject")}>
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
