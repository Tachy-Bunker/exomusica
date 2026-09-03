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
  const [notifyEmail, setNotifyEmail] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);
  const [notifyDiscordUsername, setNotifyDiscordUsername] = useState("");
  const [discordSaved, setDiscordSaved] = useState(false);

  function load() {
    api<JoinRequest[]>("/api/admin/join-requests").then(setRequests);
    api<{ joinNotifyEmail: string | null; joinNotifyDiscordUsername: string | null }>("/api/site-settings").then((s) => {
      setNotifyEmail(s.joinNotifyEmail ?? "");
      setNotifyDiscordUsername(s.joinNotifyDiscordUsername ?? "");
    });
  }

  useEffect(load, []);

  async function saveNotifyEmail() {
    await api("/api/admin/site-settings", { method: "PATCH", body: JSON.stringify({ joinNotifyEmail: notifyEmail || null }) });
    setEmailSaved(true);
    setTimeout(() => setEmailSaved(false), 2000);
  }

  async function saveNotifyDiscordUsername() {
    await api("/api/admin/site-settings", { method: "PATCH", body: JSON.stringify({ joinNotifyDiscordUsername: notifyDiscordUsername || null }) });
    setDiscordSaved(true);
    setTimeout(() => setDiscordSaved(false), 2000);
  }

  async function decide(id: number, action: "approve" | "reject") {
    await api(`/api/admin/join-requests/${id}/${action}`, { method: "POST" });
    load();
  }

  return (
    <div>
      <h1>Join requests</h1>
      <div className="field" style={{ maxWidth: 360, marginBottom: "1rem" }}>
        <label>Notify this email on new applications</label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input type="email" placeholder="you@example.com" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={saveNotifyEmail}>
            Save
          </button>
        </div>
        {emailSaved && <span style={{ fontSize: "0.8rem", color: "var(--accent-audio)" }}>Saved ✓</span>}
      </div>
      <div className="field" style={{ maxWidth: 360, marginBottom: "1rem" }}>
        <label>Notify this Discord username on new applications</label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            placeholder="your_discord_username"
            value={notifyDiscordUsername}
            onChange={(e) => setNotifyDiscordUsername(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={saveNotifyDiscordUsername}>
            Save
          </button>
        </div>
        {discordSaved && <span style={{ fontSize: "0.8rem", color: "var(--accent-audio)" }}>Saved ✓</span>}
      </div>
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
