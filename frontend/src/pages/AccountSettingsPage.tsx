import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

interface Me {
  username: string;
  email: string;
  notifyWeeklySummary: boolean;
  notifyFollowedReplies: boolean;
  notifyPrivateMessage: boolean;
}

export function AccountSettingsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [passwords, setPasswords] = useState({ current: "", next: "" });
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);

  useEffect(() => {
    api<Me>("/api/account/me").then(setMe);
  }, []);

  async function toggleNotification(key: keyof Omit<Me, "username" | "email">) {
    if (!me) return;
    const next = { ...me, [key]: !me[key] };
    setMe(next);
    await api("/api/account/notifications", { method: "PATCH", body: JSON.stringify({ [key]: next[key] }) });
  }

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);
    try {
      await api("/api/account/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword: passwords.current, newPassword: passwords.next }),
      });
      setPasswords({ current: "", next: "" });
      setPasswordMsg("Password updated.");
    } catch (err) {
      setPasswordMsg(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function handleDeleteAccount() {
    if (!confirm("Delete your account? Your messages stay attributed, but you'll be logged out and can't log back in.")) return;
    await api("/api/account", { method: "DELETE" });
    logout();
    navigate("/");
  }

  if (!me) return <p>Loading…</p>;

  return (
    <div style={{ maxWidth: 420 }}>
      <h1>Account</h1>
      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>
        {me.username} — {me.email}
      </p>

      <h2 style={{ fontSize: "1rem" }}>Email notifications</h2>
      <div className="field">
        <label>
          <input
            type="checkbox"
            checked={me.notifyWeeklySummary}
            onChange={() => toggleNotification("notifyWeeklySummary")}
          />{" "}
          Weekly activity summary
        </label>
      </div>
      <div className="field">
        <label>
          <input
            type="checkbox"
            checked={me.notifyFollowedReplies}
            onChange={() => toggleNotification("notifyFollowedReplies")}
          />{" "}
          Replies on topics I follow
        </label>
      </div>
      <div className="field">
        <label>
          <input
            type="checkbox"
            checked={me.notifyPrivateMessage}
            onChange={() => toggleNotification("notifyPrivateMessage")}
          />{" "}
          New private messages
        </label>
      </div>
      <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
        These toggles save correctly, but no email actually goes out yet — no SMTP provider is wired up.
      </p>

      <h2 style={{ fontSize: "1rem", marginTop: "1.5rem" }}>Change password</h2>
      <form onSubmit={handlePasswordChange}>
        <div className="field">
          <label htmlFor="current">Current password</label>
          <input
            id="current"
            type="password"
            value={passwords.current}
            onChange={(e) => setPasswords((p) => ({ ...p, current: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="next">New password</label>
          <input
            id="next"
            type="password"
            value={passwords.next}
            onChange={(e) => setPasswords((p) => ({ ...p, next: e.target.value }))}
          />
        </div>
        {passwordMsg && <p style={{ fontSize: "0.85rem" }}>{passwordMsg}</p>}
        <button className="btn btn-primary" type="submit">
          Update password
        </button>
      </form>

      <h2 style={{ fontSize: "1rem", marginTop: "1.5rem" }}>Danger zone</h2>
      <button className="btn btn-danger" onClick={handleDeleteAccount}>
        Delete my account
      </button>
    </div>
  );
}
