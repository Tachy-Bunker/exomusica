import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { isTypingTarget } from "../lib/isTypingTarget";
import { underlineLetter } from "../lib/underlineLetter";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCustomFont } from "../lib/useCustomFont";
import { useAmbienceStore } from "../lib/ambienceStore";
import { useProfileStore } from "../lib/profileStore";
import { useVolumeMixerStore, playLinkClickSound } from "../lib/volumeMixerStore";
import { useContentScaleStore } from "../lib/contentScaleStore";
import { useSiteEffectsStore } from "../lib/siteEffectsStore";

/** Darkens a #rrggbb hex color by mixing it toward black by `amount`
 *  (0..1). Used to derive the "-dim" variant of the admin-configurable
 *  primary color at runtime, since .btn-primary/Live/Send/etc. all use
 *  the dim variant for background/border, not the bright color directly. */
function darkenHex(hex: string, amount: number): string {
  const m = hex.replace("#", "");
  if (m.length !== 6) return hex;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c * (1 - amount));
  const toHex = (c: number) => c.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}


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
import { resumeSharedContextIfNeeded } from "../lib/oneShotSfx";

export function Layout() {
  const { user } = useAuth();
  const loadEmojis = useEmojiStore((s) => s.load);
  useGlobalPlayerShortcuts();

  const isDesktop = useIsDesktop();
  const navigate = useNavigate();

  function openDonate() {
    window.open("https://paypal.me/tachybunker", "_blank", "popup=1,width=460,height=640");
  }

  const dockOpenChannelSlug = useChatDockStore((s) => s.openChannelSlug);
  const dockPageChannel = useChatDockStore((s) => s.pageChannel);
  const dockOpenChat = useChatDockStore((s) => s.openChat);
  const dockToggleCollapse = useChatDockStore((s) => s.toggleCollapse);

  useEffect(() => {
    if (!isDesktop) return;
    function handleShortcut(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.code) {
        case "KeyC":
          navigate("/");
          break;
        case "KeyK":
          navigate("/wiki");
          break;
        case "KeyN":
          navigate("/news");
          break;
        case "KeyM":
          navigate("/discussion");
          break;
        case "KeyE":
          if (dockPageChannel && dockOpenChannelSlug !== dockPageChannel.slug) {
            dockOpenChat(dockPageChannel.slug, dockPageChannel.name, dockPageChannel.branchSlug);
          } else if (dockOpenChannelSlug) {
            dockToggleCollapse();
          }
          break;
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [isDesktop, navigate, dockPageChannel, dockOpenChannelSlug, dockOpenChat, dockToggleCollapse]);
  const dockOpen = useChatDockStore((s) => !!s.openChannelSlug);
  const dockCollapsed = useChatDockStore((s) => s.collapsed);
  const dockWidth = useChatDockStore((s) => s.width);
  // The player bar and notification widget "nudge" out of the dock's way
  // automatically — nobody has to manually rearrange anything.
  const dockOffset = isDesktop && dockOpen && !dockCollapsed ? dockWidth : 0;

  useEffect(() => {
    document.documentElement.style.setProperty("--dock-offset", `${dockOffset}px`);
  }, [dockOffset]);

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
    function handleLinkClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("a")) return;
      playLinkClickSound();
    }
    document.addEventListener("click", handleLinkClick, true);
    return () => document.removeEventListener("click", handleLinkClick, true);
  }, []);
  useEffect(() => {
    if (user) loadVolumeMixer();
  }, [user, loadVolumeMixer]);

  useEffect(() => {
    if (!user) return;
    api<{ caEnabled: boolean; moireEnabled: boolean; exclusiveMediaPlayback: boolean }>("/api/account/me").then((me) => {
      useSiteEffectsStore
        .getState()
        .setEffects({ userCaEnabled: me.caEnabled, userMoireEnabled: me.moireEnabled, exclusiveMediaPlayback: me.exclusiveMediaPlayback });
    });
  }, [user]);

  useEffect(() => {
    function handleMediaPlay(e: Event) {
      if (!useSiteEffectsStore.getState().exclusiveMediaPlayback) return;
      const target = e.target as HTMLMediaElement;
      document.querySelectorAll("audio, video").forEach((el) => {
        if (el !== target && !(el as HTMLMediaElement).paused) (el as HTMLMediaElement).pause();
      });
    }
    // 'play' doesn't bubble on media elements, but capture phase at the
    // document level still sees it fire on the way down.
    document.addEventListener("play", handleMediaPlay, true);
    return () => document.removeEventListener("play", handleMediaPlay, true);
  }, []);

  useEffect(() => {
    function resumeOnce() {
      resumeSharedContextIfNeeded();
      window.removeEventListener("pointerdown", resumeOnce);
      window.removeEventListener("keydown", resumeOnce);
    }
    window.addEventListener("pointerdown", resumeOnce);
    window.addEventListener("keydown", resumeOnce);
    return () => {
      window.removeEventListener("pointerdown", resumeOnce);
      window.removeEventListener("keydown", resumeOnce);
    };
  }, []);

  const [siteFont, setSiteFont] = useState<{ familyName: string; fileUrl: string; format: string } | null>(null);
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty("--nav-height", `${el.getBoundingClientRect().height}px`);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
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
      caInitial: number;
      chatOpenSfxUrl: string | null;
      chatHudRevealRate: number;
      chatHudSfxUrl: string | null;
      chatSplashMessages: string[] | null;
      linkClickSfxUrl: string | null;
      caBurst: number;
      moireImageUrl: string | null;
      moireOpacity: number;
      moireSize: number;
      moireOffsetMin: number;
      moireOffsetMax: number;
      moireOffsetSpeed: number;
      moireWaveform: "sine" | "triangle";
      moireRotationSpeed: number;
      faviconUrl: string | null;
    }>("/api/site-settings").then((s) => {
      setSiteFont(s.defaultFont);
      useAmbienceStore.getState().setUrl(s.ambienceUrl);
      if (s.faviconUrl) {
        let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.head.appendChild(link);
        }
        link.href = s.faviconUrl;
      }
      const root = document.documentElement.style;
      if (s.textColorPrimary) root.setProperty("--text", s.textColorPrimary);
      if (s.textColorSecondary) root.setProperty("--text-dim", s.textColorSecondary);
      if (s.chatTitleColor) root.setProperty("--chat-title-color", s.chatTitleColor);
      if (s.accentPrimaryColor) {
        root.setProperty("--accent-forum", s.accentPrimaryColor);
        root.setProperty("--accent-forum-dim", darkenHex(s.accentPrimaryColor, 0.45));
      }
      root.setProperty("--content-scale-desktop", String(s.contentTextScaleDesktop));
      root.setProperty("--content-scale-mobile", String(s.contentTextScaleMobile));
      useContentScaleStore.getState().setScale(s.contentTextScaleDesktop, s.contentTextScaleMobile);
      useSiteEffectsStore.getState().setEffects({
        caInitial: s.caInitial,
        chatOpenSfxUrl: s.chatOpenSfxUrl,
        chatHudRevealRate: s.chatHudRevealRate,
        chatHudSfxUrl: s.chatHudSfxUrl,
        chatSplashMessages: s.chatSplashMessages ?? [],
        linkClickSfxUrl: s.linkClickSfxUrl,
        caBurst: s.caBurst,
        moireImageUrl: s.moireImageUrl,
        moireOpacity: s.moireOpacity,
        moireSize: s.moireSize,
        moireOffsetMin: s.moireOffsetMin,
        moireOffsetMax: s.moireOffsetMax,
        moireOffsetSpeed: s.moireOffsetSpeed,
        moireWaveform: s.moireWaveform,
        moireRotationSpeed: s.moireRotationSpeed,
      });
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
      <header className="top-nav" ref={navRef}>
        <Link to="/" className="brand">
          {isDesktop ? <>⩽ {underlineLetter("Exomusica", "c")} ⪖</> : "⩽Exomusica⪖"}
        </Link>
        <nav>
          <Link to="/wiki">{isDesktop ? underlineLetter("Wiki", "k") : "Wiki"}</Link>
          <Link to="/news">{isDesktop ? underlineLetter("News", "n") : "News"}</Link>
          <Link to="/discussion">{isDesktop ? underlineLetter("Forums", "m") : "Forums"}</Link>
        </nav>
        <div className="spacer" />
        {user && isDesktop && <OnlineOrbs />}
        {isDesktop ? (
          user ? (
            <>
              {user.isAdmin && <Link to="/admin">Admin</Link>}
              <NotificationWidget inline offsetRight={dockOffset} />
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
              <button className="btn" onClick={openDonate}>
                💛 Donate
              </button>
            </>
          ) : (
            <>
              <Link to="/login">Log in</Link>
              <button className="btn" onClick={openDonate}>
                💛 Donate
              </button>
            </>
          )
        ) : user ? (
          <>
            <NotificationWidget inline />
            <MobileAccountHook loggedIn avatarUrl={avatarUrl} hasUnreadPms={hasUnreadPms} username={user.username} isAdmin={user.isAdmin} />
          </>
        ) : (
          <MobileAccountHook loggedIn={false} />
        )}
      </header>

      <main className="main-content" style={{ marginRight: dockOffset }}>
        <Outlet />
      </main>

      <PlayerBar />
      <ChatDock />
      <div className="crt-overlay" />
    </div>
  );
}
