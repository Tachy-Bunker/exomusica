import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useNotificationWidgetVisibility } from "../lib/notificationWidgetVisibility";
import { useProfileStore } from "../lib/profileStore";
import { Avatar } from "../components/Avatar";
import { useVolumeMixerStore } from "../lib/volumeMixerStore";
import { useSiteEffectsStore } from "../lib/siteEffectsStore";

interface FollowedChannel {
  slug: string;
  name: string;
  notifyOnReply: boolean;
}

interface Me {
  username: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  links: { label: string; url: string }[] | null;
  collaboratorSlug: string | null;
  caEnabled: boolean;
  moireEnabled: boolean;
  notifyWeeklySummary: boolean;
  notifyDailySummary: boolean;
  notifyFollowedReplies: boolean;
  notifyPrivateMessage: boolean;
  discordUsername: string | null;
  notifyDiscordWeeklySummary: boolean;
  notifyDiscordDailySummary: boolean;
  notifyDiscordFollowedReplies: boolean;
  notifyDiscordPrivateMessage: boolean;
  notifyNews: boolean;
  notifyCallsForIdeas: boolean;
  notifyCallsForArtists: boolean;
  followedChannels: FollowedChannel[];
}

type NotifyKey = Exclude<keyof Me, "username" | "email" | "followedChannels" | "discordUsername">;

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
  const setProfileAvatarUrl = useProfileStore((s) => s.setAvatarUrl);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const mixer = useVolumeMixerStore();
  const [mixerSaved, setMixerSaved] = useState(false);

  async function saveMixer() {
    await mixer.save();
    setMixerSaved(true);
    setTimeout(() => setMixerSaved(false), 2000);
  }

  function updateMeField(patch: Partial<Me>) {
    setMe((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function updateLink(index: number, patch: Partial<{ label: string; url: string }>) {
    if (!me) return;
    const links = [...(me.links ?? [])];
    links[index] = { ...links[index], ...patch };
    updateMeField({ links });
  }

  function addLink() {
    updateMeField({ links: [...(me?.links ?? []), { label: "", url: "" }] });
  }

  function removeLink(index: number) {
    updateMeField({ links: (me?.links ?? []).filter((_, i) => i !== index) });
  }

  async function toggleVisualEffect(key: "caEnabled" | "moireEnabled", value: boolean) {
    if (!me) return;
    setMe({ ...me, [key]: value });
    await api("/api/account/visual-effects", { method: "PATCH", body: JSON.stringify({ [key]: value }) });
    useSiteEffectsStore.getState().setEffects(key === "caEnabled" ? { userCaEnabled: value } : { userMoireEnabled: value });
  }

  async function saveProfile() {
    if (!me) return;
    await api("/api/account/profile", {
      method: "PATCH",
      body: JSON.stringify({ bio: me.bio, links: (me.links ?? []).filter((l) => l.label.trim() && l.url.trim()) }),
    });
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  }

  async function uploadAvatar() {
    const file = avatarInputRef.current?.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setAvatarError("Image must be 1MB or smaller.");
      return;
    }
    setAvatarError(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const result = await api<{ avatarUrl: string }>("/api/account/avatar", { method: "POST", body: formData });
      setMe((prev) => (prev ? { ...prev, avatarUrl: result.avatarUrl } : prev));
      setProfileAvatarUrl(result.avatarUrl);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    } catch (err) {
      setAvatarError(err instanceof ApiError ? err.message : "Upload failed");
    }
  }

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
      {me.collaboratorSlug && (
        <p>
          <Link to={`/collaborator/${me.collaboratorSlug}`}>Their exomusical contributions →</Link>
        </p>
      )}
      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>
        {me.username} — {me.email}
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", marginBottom: "1rem" }}>
        <Avatar url={me.avatarUrl} size={56} />
        <div>
          <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ fontSize: "0.75rem" }} />
          <button className="btn" style={{ display: "block", marginTop: "0.3rem" }} onClick={uploadAvatar}>
            Change picture
          </button>
          <p style={{ fontSize: "0.7rem", color: "var(--text-dim)", margin: "0.2rem 0 0" }}>JPG, PNG, or WEBP, 1MB max.</p>
          {avatarError && <p style={{ fontSize: "0.75rem", color: "var(--accent-danger)" }}>{avatarError}</p>}
        </div>
      </div>

      <h2 style={{ fontSize: "1rem" }}>Visual effects</h2>
      <label style={{ display: "block", fontSize: "0.9rem", marginBottom: "0.3rem" }}>
        <input type="checkbox" checked={me.caEnabled} onChange={(e) => toggleVisualEffect("caEnabled", e.target.checked)} /> Chromatic
        aberration bursts
      </label>
      <label style={{ display: "block", fontSize: "0.9rem", marginBottom: "0.8rem" }}>
        <input type="checkbox" checked={me.moireEnabled} onChange={(e) => toggleVisualEffect("moireEnabled", e.target.checked)} /> Moiré
        effect
      </label>

      <h2 style={{ fontSize: "1rem" }}>Bio & links</h2>
      <div className="field">
        <label>Bio</label>
        <textarea rows={3} value={me.bio ?? ""} onChange={(e) => updateMeField({ bio: e.target.value })} />
      </div>
      <div className="field">
        <label>Links</label>
        {(me.links ?? []).map((l, i) => (
          <div key={i} style={{ display: "flex", gap: "0.3rem", marginBottom: "0.2rem" }}>
            <input placeholder="label" value={l.label} onChange={(e) => updateLink(i, { label: e.target.value })} style={{ width: "35%" }} />
            <input placeholder="https://…" value={l.url} onChange={(e) => updateLink(i, { url: e.target.value })} style={{ flex: 1 }} />
            <button className="btn" onClick={() => removeLink(i)}>
              ×
            </button>
          </div>
        ))}
        <button className="btn" onClick={addLink}>
          Add link
        </button>
      </div>
      <button className="btn btn-primary" onClick={saveProfile}>
        Save bio & links
      </button>
      {profileSaved && <span style={{ marginLeft: "0.6rem", fontSize: "0.85rem", color: "var(--accent-audio)" }}>Saved ✓</span>}

      <h2 style={{ fontSize: "1rem", marginTop: "1.5rem" }}>Sound mixer</h2>
      <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: 0 }}>
        Independent volume for notification pings, UI sound effects (like the spacemap scan), and music (tracks and
        the idle ambience loop).
      </p>
      <div className="field">
        <label>Notifications — {Math.round(mixer.notifications * 100)}%</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={mixer.notifications}
          onChange={(e) => mixer.setVolume("notifications", Number(e.target.value))}
        />
      </div>
      <div className="field">
        <label>Sound effects (when nothing's playing) — {Math.round(mixer.sfxIdle * 100)}%</label>
        <input type="range" min={0} max={1} step={0.05} value={mixer.sfxIdle} onChange={(e) => mixer.setVolume("sfxIdle", Number(e.target.value))} />
      </div>
      <div className="field">
        <label>Sound effects (while music plays) — {Math.round(mixer.sfxPlaying * 100)}%</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={mixer.sfxPlaying}
          onChange={(e) => mixer.setVolume("sfxPlaying", Number(e.target.value))}
        />
      </div>
      <div className="field">
        <label>Music — {Math.round(mixer.music * 100)}%</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={mixer.music}
          onChange={(e) => mixer.setVolume("music", Number(e.target.value))}
        />
      </div>
      <button className="btn btn-primary" onClick={saveMixer}>
        Save mixer
      </button>
      {mixerSaved && <span style={{ marginLeft: "0.6rem", fontSize: "0.85rem", color: "var(--accent-audio)" }}>Saved ✓</span>}

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

      <h2 style={{ fontSize: "1rem" }}>Discord notifications</h2>
      <div className="field">
        <label>Your Discord username</label>
        <input
          placeholder="e.g. tachy_bunker"
          value={me.discordUsername ?? ""}
          onChange={(e) => setMe({ ...me, discordUsername: e.target.value })}
          onBlur={() => api("/api/account/notifications", { method: "PATCH", body: JSON.stringify({ discordUsername: me.discordUsername || null }) })}
        />
        <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.2rem" }}>
          Only works if you're in a Discord server the Exomusica bot is also in — it looks you up by this username to
          send DMs.
        </p>
      </div>
      {checkbox("notifyDiscordWeeklySummary", "Weekly activity summary")}
      {checkbox("notifyDiscordDailySummary", "Daily activity summary")}
      {checkbox("notifyDiscordFollowedReplies", "Replies on topics I follow")}
      {checkbox("notifyDiscordPrivateMessage", "New private messages")}
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

      <h2 style={{ fontSize: "1rem", marginTop: "1.5rem" }}>Session</h2>
      <button
        className="btn"
        onClick={() => {
          logout();
          navigate("/");
        }}
      >
        Log out
      </button>

      <h2 style={{ fontSize: "1rem", marginTop: "1.5rem" }}>Danger zone</h2>
      <button className="btn btn-danger" onClick={handleDeleteAccount}>
        Delete my account
      </button>
    </div>
  );
}
