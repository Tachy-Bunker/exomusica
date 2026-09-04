import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useVolumeMixerStore } from "../lib/volumeMixerStore";

function playNotificationSound(url: string) {
  const audio = new Audio(url);
  audio.volume = useVolumeMixerStore.getState().notifications;
  audio.play().catch(() => {});
}

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

export function NotificationWidget({ offsetRight = 0, inline = false }: { offsetRight?: number; inline?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const isHomepage = location.pathname === "/";
  const [open, setOpen] = useState(false);
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
          if (soundUrl) playNotificationSound(soundUrl);
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
          if (soundUrl) playNotificationSound(soundUrl);
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

  if (!user) return null;

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
      style={
        inline
          ? { position: "relative", display: "inline-flex" }
          : {
              position: "fixed",
              zIndex: 40,
              right: isDesktop ? `calc(1rem + ${offsetRight}px)` : "1rem",
              ...(isDesktop
                ? isHomepage
                  ? { bottom: "calc(1.2rem + var(--player-height, 0px))" }
                  : { top: "4.4rem" }
                : { top: "0.9rem" }),
            }
      }
    >
      <button
        className={`btn btn-primary notif-bell ${unread > 0 ? "notif-bell-active" : ""}`}
        onClick={handleOpen}
        style={{
          borderRadius: "50%",
          width: "2.6rem",
          height: "2.6rem",
          padding: 0,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        title="Notifications"
      >
        <svg width="33" height="33" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M10,20h4a2,2,0,0,1-4,0Zm8-4V10a6,6,0,0,0-5-5.91V3a1,1,0,0,0-2,0V4.09A6,6,0,0,0,6,10v6L4,18H20Z" />
        </svg>
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
            zIndex: 47,
            ...(inline ? { top: "calc(100% + 0.5rem)" } : isHomepage && isDesktop ? { bottom: "calc(100% + 0.5rem)" } : { top: "calc(100% + 0.5rem)" }),
            width: 300,
            maxHeight: 420,
            overflowY: "auto",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ padding: "0.5rem 0.7rem", borderBottom: "1px solid var(--border)" }}>
            <strong style={{ fontSize: "0.85rem" }}>Notifications</strong>
          </div>
          {notifications.length === 0 && <p style={{ padding: "0.7rem 0.7rem 0.3rem", fontSize: "0.8rem", color: "var(--text-dim)" }}>Nothing yet.</p>}
          {(() => {
            const priorityKeys = new Set(["mention", "message_followed_topic"]);
            const priority = notifications.filter((n) => priorityKeys.has(n.eventKey));
            const other = notifications.filter((n) => !priorityKeys.has(n.eventKey));
            const renderNotification = (n: (typeof notifications)[number]) => (
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
            );
            return (
              <>
                {priority.length > 0 && (
                  <>
                    <div style={{ padding: "0.3rem 0.7rem", fontSize: "0.7rem", textTransform: "uppercase", color: "var(--accent-forum)" }}>Priority</div>
                    {priority.map(renderNotification)}
                  </>
                )}
                {other.length > 0 && (
                  <>
                    <div style={{ padding: "0.3rem 0.7rem", fontSize: "0.7rem", textTransform: "uppercase", color: "var(--text-dim)" }}>Other</div>
                    {other.map(renderNotification)}
                  </>
                )}
              </>
            );
          })()}

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
