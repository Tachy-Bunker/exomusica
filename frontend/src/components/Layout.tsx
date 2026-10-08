import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { isTypingTarget } from "../lib/isTypingTarget";
import { underlineLetter } from "../lib/underlineLetter";
import { sectionOf, type Section } from "../lib/navSections";
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
import { useChatPipStore } from "../lib/chatPipStore";
import { PopoutChatContent } from "./PopoutChatContent";
import { Toast } from "./Toast";
import { createPortal } from "react-dom";
import { useIsDesktop } from "../lib/useIsDesktop";
import { ChatDock } from "./ChatDock";
import { NotificationWidget } from "./NotificationWidget";
import { OnlineOrbs } from "./OnlineOrbs";
import { useGuestOnline } from "../lib/useGuestOnline";
import { PlayerBar } from "./PlayerBar";
import { AtlasShell } from "./AtlasShell";
import { takeArrival } from "../lib/arrive";
import { TrackPreloader } from "./TrackPreloader";
import { resumeSharedContextIfNeeded } from "../lib/oneShotSfx";
import { resumeAnalyserContextIfNeeded } from "../lib/audioAnalyser";

const NAV_SECTIONS: { section: Section; label: string; to: string; letter: string }[] = [
  { section: "soundbay", label: "Soundbay", to: "/soundbay", letter: "b" },
  { section: "xenolab", label: "XenoLab", to: "/xenolab", letter: "x" },
  { section: "telemetry", label: "Telemetry", to: "/telemetry", letter: "m" },
  { section: "log", label: "Log", to: "/wiki", letter: "g" },
];

export function Layout() {
  const { user } = useAuth();
  useGuestOnline(!user);
  const loadEmojis = useEmojiStore((s) => s.load);
  useGlobalPlayerShortcuts();
  const pipWindow = useChatPipStore((s) => s.pipWindow);

  const isDesktop = useIsDesktop();
  const location = useLocation();
  const navigate = useNavigate();
  const activeSection = sectionOf(location.pathname);

  function openDonate() {
    window.open("https://paypal.me/tachybunker", "_blank", "popup=1,width=460,height=640");
  }

  const dockOpenChannelSlug = useChatDockStore((s) => s.openChannelSlug);
  const dockPageChannel = useChatDockStore((s) => s.pageChannel);
  const dockOpenChat = useChatDockStore((s) => s.openChat);
  const dockToggleCollapse = useChatDockStore((s) => s.toggleCollapse);
  const suppressGlobalEShortcut = useChatDockStore((s) => s.suppressGlobalEShortcut);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (!isTypingTarget(e.target)) return;
      (e.target as HTMLElement).blur();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);
  useEffect(() => {
    if (!isDesktop) return;
    function handleShortcut(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('[aria-modal="true"]')) return; // a dialog or the full-screen map is open: its keys are its own
      // These are letter shortcuts, matched to the actual character
      // produced (e.key), not the physical key position (e.code) - on
      // AZERTY and other non-QWERTY layouts, the key at the QWERTY "M"
      // position doesn't produce "m" at all, so e.code would silently
      // never fire for anyone not on QWERTY.
      switch (e.key.toLowerCase()) {
        // Only shortcuts that are shown on screen (the underlined letters) exist. The letters are chosen to stay clear of
        // everything else: W A S D E F T R move around the maps and return from a page, L and P belong to the player.
        case "c":
          navigate("/");
          break;
        case "b":
          navigate("/soundbay");
          break;
        case "x":
          navigate("/xenolab");
          break;
        case "m":
          navigate("/telemetry");
          break;
        case "g":
          navigate("/wiki");
          break;
        case "e":
          if (suppressGlobalEShortcut) break; // a page with its own E-key handling (e.g. the forum map's crosshair reveal/enter) owns this keypress instead
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
  }, [isDesktop, navigate, dockPageChannel, dockOpenChannelSlug, dockOpenChat, dockToggleCollapse, suppressGlobalEShortcut]);
  const dockOpen = useChatDockStore((s) => !!s.openChannelSlug);
  const dockCollapsed = useChatDockStore((s) => s.collapsed);
  const dockWidth = useChatDockStore((s) => s.width);
  // The player bar and notification widget "nudge" out of the dock's way
  // automatically - nobody has to manually rearrange anything.
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
      resumeAnalyserContextIfNeeded();
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
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => { // a jump from the margins / terminal / faceplate: the new page slides in from the side it was reached from
    const edge = takeArrival();
    const el = mainRef.current;
    if (!edge || !el) return;
    el.dataset.arrive = edge;
    const id = window.setTimeout(() => { delete el.dataset.arrive; }, 380);
    return () => window.clearTimeout(id);
  }, [location.pathname, location.search]);
  useEffect(() => { // --nav-height is everything pinned above the page: the header and the faceplate under it
    const header = navRef.current;
    if (!header) return;
    const faceplate = document.querySelector<HTMLElement>(".faceplate");
    const apply = () => document.documentElement.style.setProperty("--nav-height", `${header.getBoundingClientRect().height + (faceplate?.getBoundingClientRect().height ?? 0)}px`);
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    if (faceplate) observer.observe(faceplate);
    apply();
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
      usernameColor: string | null;
      playHighlightColor?: string | null;
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
      if (s.usernameColor) root.setProperty("--username-color", s.usernameColor);
      useSiteEffectsStore.getState().setEffects({ playHighlightColor: s.playHighlightColor === "off" ? null : (s.playHighlightColor ?? "#8fd8ff") });
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
    // siteFontFamily below - that value's own fallback chain ends in
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
        <div className="nav-side nav-left">
          {isDesktop && <OnlineOrbs />}
          <nav className="nav-pair" aria-label="Primary">
            {NAV_SECTIONS.slice(0, 2).map((n) => (
              <Link key={n.section} to={n.to} className="nav-link" aria-current={activeSection === n.section ? "page" : undefined}>
                {isDesktop ? underlineLetter(n.label, n.letter) : n.label}
              </Link>
            ))}
          </nav>
        </div>
        <Link to="/" className="brand" aria-current={location.pathname === "/" ? "page" : undefined}>
          {isDesktop ? <>⩽ {underlineLetter("EXOMUSICA", "c")} ⪖</> : "⩽EXOMUSICA⪖"}
        </Link>
        <div className="nav-side nav-right">
          <nav className="nav-pair" aria-label="Secondary">
            {NAV_SECTIONS.slice(2).map((n) => (
              <Link key={n.section} to={n.to} className="nav-link" aria-current={activeSection === n.section ? "page" : undefined}>
                {isDesktop ? underlineLetter(n.label, n.letter) : n.label}
              </Link>
            ))}
          </nav>
          <div className="nav-tools">
            {isDesktop ? (
              user ? (
                <>
                  {user.isAdmin && (
                    <Link to="/admin" className="nav-admin" title="Admin" aria-label="Admin">
                      <span className="nav-admin-label">Admin</span>
                      <span className="nav-admin-icon" aria-hidden="true">⚙</span>
                    </Link>
                  )}
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
                  <button className="btn nav-donate" onClick={openDonate} title="Donate">
                    💛<span className="nav-donate-label"> Donate</span>
                  </button>
                </>
              ) : (
                <>
                  <NotificationWidget inline offsetRight={dockOffset} />
                  <Link to="/login">Log in</Link>
                  <button className="btn nav-donate" onClick={openDonate} title="Donate">
                    💛<span className="nav-donate-label"> Donate</span>
                  </button>
                </>
              )
            ) : user ? (
              <>
                <NotificationWidget inline />
                <MobileAccountHook loggedIn avatarUrl={avatarUrl} hasUnreadPms={hasUnreadPms} username={user.username} isAdmin={user.isAdmin} />
              </>
            ) : (
              <>
                <NotificationWidget inline />
                <MobileAccountHook loggedIn={false} />
              </>
            )}
          </div>
        </div>
      </header>

      <AtlasShell />

      <main className="main-content" ref={mainRef} style={{ marginRight: dockOffset }}>
        <Outlet />
      </main>

      <PlayerBar />
      <TrackPreloader />
      <ChatDock />
      {(isDesktop || location.pathname === "/" || location.pathname.startsWith("/playlist/") || location.pathname.startsWith("/discussion")) && (
        <div className="crt-overlay" />
      )}
      <Toast />
      {pipWindow && createPortal(<PopoutChatContent />, pipWindow.document.body)}
    </div>
  );
}
