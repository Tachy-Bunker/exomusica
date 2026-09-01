import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useNotificationWidgetVisibility } from "../lib/notificationWidgetVisibility";

interface Notification {
  id: number;
  eventKey: string;
  channelSlug: string | null;
  messageId: number | null;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

interface SoundPref {
  key: string;
  soundUrl: string | null;
}

const POLL_MS = 20000;

export function NotificationWidget() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const hidden = useNotificationWidgetVisibility((s) => s.hidden);
  const setHidden = useNotificationWidgetVisibility((s) => s.setHidden);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const seenIds = useRef<Set<number>>(new Set());
  const soundPrefs = useRef<Map<string, string | null>>(new Map());
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    if (!user) return;
    api<SoundPref[]>("/api/account/sound-prefs").then((prefs) => {
      soundPrefs.current = new Map(prefs.map((p) => [p.key, p.soundUrl]));
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function poll() {
      const list = await api<Notification[]>("/api/notifications");
      if (cancelled) return;
      for (const n of list) {
        if (hasLoadedOnce.current && !seenIds.current.has(n.id)) {
          const soundUrl = soundPrefs.current.get(n.eventKey);
          if (soundUrl) new Audio(soundUrl).play().catch(() => {});
        }
        seenIds.current.add(n.id);
      }
      hasLoadedOnce.current = true;
      setNotifications(list);
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

  if (!user || hidden) return null;

  const unread = notifications.filter((n) => !n.read).length;

  async function handleOpen() {
    setOpen((v) => !v);
    if (!open && unread > 0) {
      await api("/api/notifications/read-all", { method: "POST" });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  }

  function handleClick(n: Notification) {
    setOpen(false);
    if (n.channelSlug && n.messageId) {
      navigate(`/topic/${n.channelSlug}?day=${new Date(n.createdAt).toISOString().slice(0, 10)}#m-${n.messageId}`);
    }
  }

  return (
    <div style={{ position: "fixed", bottom: "5rem", right: "1rem", zIndex: 40 }}>
      {open && (
        <div
          style={{
            width: 300,
            maxHeight: 360,
            overflowY: "auto",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            marginBottom: "0.5rem",
            boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0.7rem", borderBottom: "1px solid var(--border)" }}>
            <strong style={{ fontSize: "0.85rem" }}>Notifications</strong>
            <button
              className="btn"
              style={{ padding: "0 0.4rem", fontSize: "0.7rem" }}
              onClick={() => setHidden(true)}
              title="Hide this widget"
            >
              Hide
            </button>
          </div>
          {notifications.length === 0 && <p style={{ padding: "0.7rem", fontSize: "0.8rem", color: "var(--text-dim)" }}>Nothing yet.</p>}
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              style={{
                padding: "0.5rem 0.7rem",
                borderBottom: "1px solid var(--border)",
                cursor: n.channelSlug ? "pointer" : "default",
                fontSize: "0.8rem",
              }}
            >
              <div style={{ fontWeight: 600 }}>{n.title}</div>
              <div style={{ color: "var(--text-dim)" }}>{n.body}</div>
            </div>
          ))}
        </div>
      )}
      <button
        className="btn btn-primary"
        onClick={handleOpen}
        style={{ borderRadius: "50%", width: "2.6rem", height: "2.6rem", position: "relative" }}
        title="Notifications"
      >
        🔔
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              background: "var(--accent-danger)",
              borderRadius: "50%",
              width: 18,
              height: 18,
              fontSize: "0.65rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {unread}
          </span>
        )}
      </button>
    </div>
  );
}
