import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useNotificationWidgetVisibility } from "../lib/notificationWidgetVisibility";

interface FollowedChannel {
  slug: string;
  name: string;
  notifyOnReply: boolean;
}

interface Me {
  username: string;
  email: string;
  notifyWeeklySummary: boolean;
  notifyDailySummary: boolean;
  notifyFollowedReplies: boolean;
  notifyPrivateMessage: boolean;
  notifyNews: boolean;
  notifyCallsForIdeas: boolean;
  notifyCallsForArtists: boolean;
  followedChannels: FollowedChannel[];
}

type NotifyKey = Exclude<keyof Me, "username" | "email" | "followedChannels">;

interface SoundPref {
  eventId: number;
  key: string;
  label: string;
  hasOverride: boolean;
  soundId: number | null;
  soundUrl: string | null;
}

interface Sound {
  id: number;
  name: string;
  fileUrl: string;
}

export function AccountSettingsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [passwords, setPasswords] = useState({ current: "", next: "" });
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [soundPrefs, setSoundPrefs] = useState<SoundPref[]>([]);
  const [sounds, setSounds] = useState<Sound[]>([]);
  const widgetHidden = useNotificationWidgetVisibility((s) => s.hidden);
  const setWidgetHidden = useNotificationWidgetVisibility((s) => s.setHidden);

  useEffect(() => {
    api<Me>("/api/account/me").then(setMe);
    api<SoundPref[]>("/api/account/sound-prefs").then(setSoundPrefs);
    api<Sound[]>("/api/notification-sounds").then(setSounds);
  }, []);

  async function changeSoundPref(eventId: number, soundIdStr: string) {
    if (soundIdStr === "__default__") {
      await api(`/api/account/sound-prefs/${eventId}`, { method: "DELETE" });
    } else {
      await api(`/api/account/sound-prefs/${eventId}`, {
        method: "PUT",
        body: JSON.stringify({ soundId: soundIdStr ? Number(soundIdStr) : null }),
      });
    }
    api<SoundPref[]>("/api/account/sound-prefs").then(setSoundPrefs);
  }

  function previewSound(url: string | null) {
    if (url) new Audio(url).play().catch(() => {});
  }


  async function toggleNotification(key: NotifyKey) {
    if (!me) return;
    const next = { ...me, [key]: !me[key] };
    setMe(next);
    await api("/api/account/notifications", { method: "PATCH", body: JSON.stringify({ [key]: next[key] }) });
  }

  async function toggleTopicReply(slug: string, current: boolean) {
    if (!me) return;
    setMe({
      ...me,
      followedChannels: me.followedChannels.map((c) => (c.slug === slug ? { ...c, notifyOnReply: !current } : c)),
    });
    await api(`/api/channels/${slug}/follow/notifications`, {
      method: "PATCH",
      body: JSON.stringify({ notifyOnReply: !current }),
    });
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

  const checkbox = (key: NotifyKey, label: string) => (
    <div className="field">
      <label>
        <input type="checkbox" checked={me[key] as boolean} onChange={() => toggleNotification(key)} /> {label}
      </label>
    </div>
  );

  return (
    <div style={{ maxWidth: 420 }}>
      <h1>Account</h1>
      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>
        {me.username} — {me.email}
      </p>

      <h2 style={{ fontSize: "1rem" }}>Email notifications</h2>
      {checkbox("notifyWeeklySummary", "Weekly activity summary")}
      {checkbox("notifyDailySummary", "Daily activity summary")}
      {checkbox("notifyFollowedReplies", "Replies on topics I follow")}
      {me.notifyFollowedReplies && me.followedChannels.length > 0 && (
        <div style={{ marginLeft: "1.2rem", marginBottom: "0.5rem" }}>
          {me.followedChannels.map((c) => (
            <div key={c.slug} className="field" style={{ marginBottom: "0.2rem" }}>
              <label style={{ fontSize: "0.85rem" }}>
                <input
                  type="checkbox"
                  checked={c.notifyOnReply}
                  onChange={() => toggleTopicReply(c.slug, c.notifyOnReply)}
                />{" "}
                {c.name}
              </label>
            </div>
          ))}
        </div>
      )}
      {checkbox("notifyPrivateMessage", "New private messages")}
      {checkbox("notifyNews", "Exomusica News")}
      {checkbox("notifyCallsForIdeas", "Calls for ideas")}
      {checkbox("notifyCallsForArtists", "Calls for artists")}
      <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
        These toggles save correctly. Whether email actually arrives depends on SMTP being configured and working —
        ask an admin if you're not receiving anything you expect to.
      </p>

      <h2 style={{ fontSize: "1rem", marginTop: "1.5rem" }}>Notification sounds</h2>
      {soundPrefs.map((p) => (
        <div key={p.eventId} className="field" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <label style={{ flex: 1, fontSize: "0.85rem" }}>{p.label}</label>
          <select
            value={p.hasOverride ? (p.soundId ?? "") : "__default__"}
            onChange={(e) => changeSoundPref(p.eventId, e.target.value)}
            style={{ fontSize: "0.8rem" }}
          >
            <option value="__default__">Site default</option>
            <option value="">Off</option>
            {sounds.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button className="btn" style={{ padding: "0.1rem 0.5rem" }} onClick={() => previewSound(p.soundUrl)} disabled={!p.soundUrl}>
            ▶
          </button>
        </div>
      ))}
      <div className="field">
        <label>
          <input type="checkbox" checked={!widgetHidden} onChange={(e) => setWidgetHidden(!e.target.checked)} /> Show the
          notification widget
        </label>
      </div>

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
