import { useEffect, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCustomFont } from "../lib/useCustomFont";
import { useAmbienceStore } from "../lib/ambienceStore";
import { useProfileStore } from "../lib/profileStore";
import { useVolumeMixerStore } from "../lib/volumeMixerStore";
import { useContentScaleStore } from "../lib/contentScaleStore";
import { Avatar } from "./Avatar";
import { MailIcon, MailNotificationIcon } from "./Icons";
import { MobileAccountHook } from "./MobileAccountHook";
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
  const { user } = useAuth();
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

  const avatarUrl = useProfileStore((s) => s.avatarUrl);
  const hasUnreadPms = useProfileStore((s) => s.hasUnreadPms);
  const refreshProfile = useProfileStore((s) => s.refresh);
  useEffect(() => {
    if (!user) return;
    refreshProfile();
    const interval = setInterval(refreshProfile, 20000);
    return () => clearInterval(interval);
  }, [user, refreshProfile]);

  const loadVolumeMixer = useVolumeMixerStore((s) => s.load);
  useEffect(() => {
    if (user) loadVolumeMixer();
  }, [user, loadVolumeMixer]);

  const [siteFont, setSiteFont] = useState<{ familyName: string; fileUrl: string; format: string } | null>(null);
  useEffect(() => {
    api<{
      defaultFont: typeof siteFont;
      ambienceUrl: string | null;
      textColorPrimary: string | null;
      textColorSecondary: string | null;
      chatTitleColor: string | null;
      accentPrimaryColor: string | null;
      contentTextScaleDesktop: number;
      contentTextScaleMobile: number;
    }>("/api/site-settings").then((s) => {
      setSiteFont(s.defaultFont);
      useAmbienceStore.getState().setUrl(s.ambienceUrl);
      const root = document.documentElement.style;
      if (s.textColorPrimary) root.setProperty("--text", s.textColorPrimary);
      if (s.textColorSecondary) root.setProperty("--text-dim", s.textColorSecondary);
      if (s.chatTitleColor) root.setProperty("--chat-title-color", s.chatTitleColor);
      if (s.accentPrimaryColor) root.setProperty("--accent-forum", s.accentPrimaryColor);
      root.setProperty("--content-scale-desktop", String(s.contentTextScaleDesktop));
      root.setProperty("--content-scale-mobile", String(s.contentTextScaleMobile));
      useContentScaleStore.getState().setScale(s.contentTextScaleDesktop, s.contentTextScaleMobile);
    });
  }, []);
  useCustomFont(siteFont); // still needed for its @font-face injection side effect

  const currentTrack = useAudioStore((s) => s.currentTrack);
  const setAmbienceHasMainTrack = useAmbienceStore((s) => s.setHasMainTrack);
  useEffect(() => {
    setAmbienceHasMainTrack(!!currentTrack);
  }, [currentTrack, setAmbienceHasMainTrack]);
  useEffect(() => {
    // Deliberately using siteFont.familyName directly here, not
    // siteFontFamily below — that value's own fallback chain ends in
    // var(--font-body), which is exactly the property being set. Assigning
    // that in would make --font-body reference itself: an invalid CSS
    // custom property that silently falls back to the browser default
    // instead of the chosen font.
    if (siteFont) {
      document.documentElement.style.setProperty("--font-body", `"${siteFont.familyName}"`);
      document.documentElement.style.setProperty("--font-display", `"${siteFont.familyName}"`);
    } else {
      document.documentElement.style.removeProperty("--font-body");
      document.documentElement.style.removeProperty("--font-display");
    }
  }, [siteFont]);

  return (
    <div
      className="app-shell"
      style={{ "--dock-offset": `${dockOffset}px` } as React.CSSProperties}
    >
      <header className="top-nav">
        <Link to="/" className="brand">
          ⩽ Exomusica ⪖
        </Link>
        <nav>
          <Link to="/wiki">Wiki</Link>
          <Link to="/news">News</Link>
          <Link to="/discussion">Forums</Link>
        </nav>
        <div className="spacer" />
        {user && isDesktop && <OnlineOrbs />}
        {user ? (
          <>
            {user.isAdmin && <Link to="/admin">Admin</Link>}
            {isDesktop && (
              <>
                <Link
                  to="/pms"
                  style={{ position: "relative", display: "inline-flex", color: "var(--accent-forum)" }}
                  title="Messages"
                >
                  {hasUnreadPms ? <MailNotificationIcon /> : <MailIcon />}
                </Link>
                <Link to="/account" title={user.username}>
                  <Avatar url={avatarUrl} />
                </Link>
              </>
            )}
            {!isDesktop && <MobileAccountHook avatarUrl={avatarUrl} hasUnreadPms={hasUnreadPms} username={user.username} />}
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
