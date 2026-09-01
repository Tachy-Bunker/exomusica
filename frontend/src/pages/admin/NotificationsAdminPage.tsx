import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";

interface Sound {
  id: number;
  name: string;
  fileUrl: string;
}

interface EventRow {
  id: number;
  key: string;
  label: string;
  defaultSoundId: number | null;
}

export function NotificationsAdminPage() {
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [soundName, setSoundName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newEvent, setNewEvent] = useState({ key: "", label: "" });

  function load() {
    api<Sound[]>("/api/notification-sounds").then(setSounds);
    api<EventRow[]>("/api/notification-events").then(setEvents);
  }
  useEffect(load, []);

  async function handleUploadSound() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    if (soundName.trim()) formData.append("name", soundName.trim());
    try {
      await api("/api/admin/notification-sounds", { method: "POST", body: formData });
      setSoundName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    }
  }

  async function deleteSound(id: number) {
    await api(`/api/admin/notification-sounds/${id}`, { method: "DELETE" });
    load();
  }

  function preview(url: string) {
    new Audio(url).play().catch(() => {});
  }

  async function createEvent() {
    if (!newEvent.key.trim() || !newEvent.label.trim()) return;
    await api("/api/admin/notification-events", { method: "POST", body: JSON.stringify(newEvent) });
    setNewEvent({ key: "", label: "" });
    load();
  }

  async function setDefaultSound(event: EventRow, soundIdStr: string) {
    await api(`/api/admin/notification-events/${event.id}`, {
      method: "PATCH",
      body: JSON.stringify({ defaultSoundId: soundIdStr ? Number(soundIdStr) : null }),
    });
    load();
  }

  async function deleteEvent(id: number) {
    if (!confirm("Delete this event? Anyone with a sound preference set for it loses that preference.")) return;
    await api(`/api/admin/notification-events/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <h1>Notification sounds</h1>

      <h2 style={{ fontSize: "0.9rem" }}>Sound library</h2>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <input placeholder="Name (optional)" value={soundName} onChange={(e) => setSoundName(e.target.value)} />
        <input ref={fileInputRef} type="file" accept=".mp3,.wav,.ogg" />
        <button className="btn btn-primary" onClick={handleUploadSound}>
          Upload
        </button>
      </div>
      {error && <p style={{ color: "var(--accent-danger)" }}>{error}</p>}
      {sounds.map((s) => (
        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.3rem" }}>
          <span style={{ width: 160, fontSize: "0.85rem" }}>{s.name}</span>
          <button className="btn" onClick={() => preview(s.fileUrl)}>
            ▶
          </button>
          <button className="btn btn-danger" onClick={() => deleteSound(s.id)}>
            Delete
          </button>
        </div>
      ))}

      <h2 style={{ fontSize: "0.9rem", marginTop: "1.5rem" }}>Events</h2>
      <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
        You can create as many events as you like, but only these four keys have real code wired to fire them right
        now: <code>message_followed_topic</code>, <code>message_other_topic</code>, <code>join_approved</code>,{" "}
        <code>account_updated</code>. Anything else you create here is storable and selectable in everyone's
        preferences, but nothing triggers it automatically yet.
      </p>
      {events.map((e) => (
        <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.3rem" }}>
          <span className="mono" style={{ width: 200, fontSize: "0.8rem" }}>
            {e.key}
          </span>
          <span style={{ flex: 1, fontSize: "0.85rem" }}>{e.label}</span>
          <select value={e.defaultSoundId ?? ""} onChange={(ev) => setDefaultSound(e, ev.target.value)}>
            <option value="">No default sound</option>
            {sounds.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button className="btn btn-danger" onClick={() => deleteEvent(e.id)}>
            Delete
          </button>
        </div>
      ))}

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <input
          placeholder="key (e.g. new_award)"
          value={newEvent.key}
          onChange={(e) => setNewEvent((f) => ({ ...f, key: e.target.value }))}
        />
        <input
          placeholder="Label shown to users"
          value={newEvent.label}
          onChange={(e) => setNewEvent((f) => ({ ...f, label: e.target.value }))}
        />
        <button className="btn btn-primary" onClick={createEvent}>
          Add event
        </button>
      </div>
    </div>
  );
}
