import { useEffect } from "react";
import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useEmojiStore } from "../lib/emojiStore";
import { useGlobalPlayerShortcuts } from "../lib/useGlobalPlayerShortcuts";
import { useChatDockStore } from "../lib/chatDockStore";
import { useIsDesktop } from "../lib/useIsDesktop";
import { ChatDock } from "./ChatDock";
import { NotificationWidget } from "./NotificationWidget";
import { PlayerBar } from "./PlayerBar";

export function Layout() {
  const { user, logout } = useAuth();
  const loadEmojis = useEmojiStore((s) => s.load);
  useGlobalPlayerShortcuts();

  const isDesktop = useIsDesktop();
  const dockOpen = useChatDockStore((s) => !!s.openChannelSlug);
  const dockCollapsed = useChatDockStore((s) => s.collapsed);
  const dockWidth = useChatDockStore((s) => s.width);
  // The player bar and notification widget "nudge" out of the dock's way
  // automatically — nobody has to manually rearrange anything.
  const dockOffset = isDesktop && dockOpen && !dockCollapsed ? dockWidth : 0;

  useEffect(() => {
    loadEmojis();
  }, [loadEmojis]);

  return (
    <div className="app-shell" style={{ "--dock-offset": `${dockOffset}px` } as React.CSSProperties}>
      <header className="top-nav">
        <Link to="/" className="brand">
          Exomusica
        </Link>
        <nav>
          <Link to="/about">About</Link>
          <Link to="/wiki">Wiki</Link>
          <Link to="/news">News</Link>
          <Link to="/discussion">Discussion</Link>
        </nav>
        <div className="spacer" />
        {user ? (
          <>
            {user.isAdmin && <Link to="/admin">Admin</Link>}
            <Link to="/pms">Messages</Link>
            <Link to="/account">{user.username}</Link>
            <button className="btn" onClick={logout}>
              Log out
            </button>
          </>
        ) : (
          <Link to="/login">Log in</Link>
        )}
      </header>

      <main className="main-content" style={{ marginRight: dockOffset }}>
        <Outlet />
      </main>

      <PlayerBar />
      <NotificationWidget offsetRight={dockOffset} />
      <ChatDock />
    </div>
  );
}
