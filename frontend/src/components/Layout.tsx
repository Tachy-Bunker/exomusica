import { useEffect, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCustomFont } from "../lib/useCustomFont";
import { useAmbienceStore } from "../lib/ambienceStore";
import { useAudioStore } from "../lib/audioStore";
import { useEmojiStore } from "../lib/emojiStore";
import { useGlobalPlayerShortcuts } from "../lib/useGlobalPlayerShortcuts";
import { useChatDockStore } from "../lib/chatDockStore";
import { usePresenceStore } from "../lib/presenceStore";
import { useIsDesktop } from "../lib/useIsDesktop";
import { ChatDock } from "./ChatDock";
import { NotificationWidget } from "./NotificationWidget";
import { OnlineOrbs } from "./OnlineOrbs";
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

  const connectPresence = usePresenceStore((s) => s.connect);
  useEffect(() => {
    if (user) connectPresence();
  }, [user, connectPresence]);

  const [siteFont, setSiteFont] = useState<{ familyName: string; fileUrl: string; format: string } | null>(null);
  useEffect(() => {
    api<{ defaultFont: typeof siteFont; ambienceUrl: string | null }>("/api/site-settings").then((s) => {
      setSiteFont(s.defaultFont);
      useAmbienceStore.getState().setUrl(s.ambienceUrl);
    });
  }, []);
  const siteFontFamily = useCustomFont(siteFont);

  const currentTrack = useAudioStore((s) => s.currentTrack);
  const setAmbienceHasMainTrack = useAmbienceStore((s) => s.setHasMainTrack);
  useEffect(() => {
    setAmbienceHasMainTrack(!!currentTrack);
  }, [currentTrack, setAmbienceHasMainTrack]);
  useEffect(() => {
    if (siteFontFamily) document.documentElement.style.setProperty("--font-body", siteFontFamily);
    else document.documentElement.style.removeProperty("--font-body");
  }, [siteFontFamily]);

  return (
    <div
      className="app-shell"
      style={{ "--dock-offset": `${dockOffset}px` } as React.CSSProperties}
    >
      <header className="top-nav">
        <Link to="/" className="brand">
          Exomusica
        </Link>
        <nav>
          <Link to="/wiki">Wiki</Link>
          <Link to="/news">News</Link>
          <Link to="/discussion">Forums</Link>
        </nav>
        <div className="spacer" />
        {user && <OnlineOrbs />}
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
      <div className="crt-overlay" />
    </div>
  );
}
