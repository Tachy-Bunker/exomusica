import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useNotificationWidgetVisibility } from "../lib/notificationWidgetVisibility";
import { useIsDesktop } from "../lib/useIsDesktop";

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

interface RecentMessage {
  id: number;
  channelSlug: string;
  channelName: string;
  authorUsername: string;
  excerpt: string;
  unixTimestamp: number;
}

interface SoundPref {
  key: string;
  soundUrl: string | null;
}

const POLL_MS = 20000;

// Shared by the widget's own click-to-jump and by ChannelPage's — a message
// still on today's UTC date is still in the live feed, not yet archived,
// so jumping to it should land in live mode, not force a day-archive view.
function jumpUrl(channelSlug: string, unixTimestamp: number, messageId: number): string {
  const day = new Date(unixTimestamp * 1000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return day === today ? `/topic/${channelSlug}#m-${messageId}` : `/topic/${channelSlug}?day=${day}#m-${messageId}`;
}

export function NotificationWidget({ offsetRight = 0 }: { offsetRight?: number }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const isHomepage = location.pathname === "/";
  const [open, setOpen] = useState(false);
  const hidden = useNotificationWidgetVisibility((s) => s.hidden);
  const setHidden = useNotificationWidgetVisibility((s) => s.setHidden);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [recent, setRecent] = useState<RecentMessage[]>([]);
  const seenNotificationIds = useRef<Set<number>>(new Set());
  const seenRecentIds = useRef<Set<number>>(new Set());
  const soundPrefs = useRef<Map<string, string | null>>(new Map());
  const followedSlugs = useRef<Set<string>>(new Set());
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    if (!user) return;
    api<SoundPref[]>("/api/account/sound-prefs").then((prefs) => {
      soundPrefs.current = new Map(prefs.map((p) => [p.key, p.soundUrl]));
    });
    api<string[]>("/api/account/followed-channels").then((slugs) => {
      followedSlugs.current = new Set(slugs);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const username = user.username;
    let cancelled = false;

    async function poll() {
      const [notifList, recentList] = await Promise.all([
        api<Notification[]>("/api/notifications"),
        api<RecentMessage[]>("/api/recent-messages?limit=3"),
      ]);
      if (cancelled) return;

      for (const n of notifList) {
        if (hasLoadedOnce.current && !seenNotificationIds.current.has(n.id)) {
          const soundUrl = soundPrefs.current.get(n.eventKey);
          if (soundUrl) new Audio(soundUrl).play().catch(() => {});
        }
        seenNotificationIds.current.add(n.id);
      }

      // Unfollowed-topic attention ping — site-wide, not tied to whichever
      // page you're currently on, since the whole point is to get your
      // attention when you're looking at something else entirely.
      for (const m of recentList) {
        const isNew = hasLoadedOnce.current && !seenRecentIds.current.has(m.id);
        const isOwnPost = m.authorUsername === username;
        const isFollowed = followedSlugs.current.has(m.channelSlug);
        if (isNew && !isOwnPost && !isFollowed) {
          const soundUrl = soundPrefs.current.get("message_other_topic");
          if (soundUrl) new Audio(soundUrl).play().catch(() => {});
        }
        seenRecentIds.current.add(m.id);
      }

      hasLoadedOnce.current = true;
      setNotifications(notifList);
      setRecent(recentList);
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

  function handleNotificationClick(n: Notification) {
    setOpen(false);
    if (n.channelSlug && n.messageId) {
      navigate(jumpUrl(n.channelSlug, Math.floor(new Date(n.createdAt).getTime() / 1000), n.messageId));
    }
  }

  function handleRecentClick(m: RecentMessage) {
    setOpen(false);
    navigate(jumpUrl(m.channelSlug, m.unixTimestamp, m.id));
  }

  return (
    <div
      style={{
        position: "fixed",
        zIndex: 40,
        right: `calc(1rem + ${offsetRight}px)`,
        ...(isHomepage
          ? isDesktop
            ? { bottom: "1.2rem" }
            : { top: "4rem" }
          : { top: "4.4rem" }),
      }}
    >
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
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            ...(isHomepage && isDesktop ? { bottom: "calc(100% + 0.5rem)" } : { top: "calc(100% + 0.5rem)" }),
            width: 300,
            maxHeight: 420,
            overflowY: "auto",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0.7rem", borderBottom: "1px solid var(--border)" }}>
            <strong style={{ fontSize: "0.85rem" }}>Notifications</strong>
            <button className="btn" style={{ padding: "0 0.4rem", fontSize: "0.7rem" }} onClick={() => setHidden(true)} title="Hide this widget">
              Hide
            </button>
          </div>
          {notifications.length === 0 && <p style={{ padding: "0.7rem 0.7rem 0.3rem", fontSize: "0.8rem", color: "var(--text-dim)" }}>Nothing yet.</p>}
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => handleNotificationClick(n)}
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

          <div style={{ padding: "0.4rem 0.7rem", fontSize: "0.7rem", textTransform: "uppercase", color: "var(--text-dim)", borderTop: "1px solid var(--border)" }}>
            Recent activity — any topic
          </div>
          {recent.map((m) => (
            <div
              key={m.id}
              onClick={() => handleRecentClick(m)}
              style={{ padding: "0.5rem 0.7rem", borderBottom: "1px solid var(--border)", cursor: "pointer", fontSize: "0.8rem" }}
            >
              <div style={{ color: "var(--text-dim)", fontSize: "0.7rem" }}>{m.channelName}</div>
              <div>
                <strong>{m.authorUsername}</strong>: {m.excerpt}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
