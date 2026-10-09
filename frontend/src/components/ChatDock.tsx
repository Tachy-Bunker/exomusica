import { branchHref } from "../lib/branchLinks";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Link } from "react-router-dom";
import { useChatDockStore } from "../lib/chatDockStore";
import { useIsDesktop } from "../lib/useIsDesktop";
import { ChannelPage } from "../pages/ChannelPage";
import { useFixedPortalRoot } from "../lib/useFixedPortalRoot";
import { DialRail } from "./DialRail";
import { RoomSwitcher, WHISPER } from "./RoomSwitcher";
import { useDialPulse, useDialSync } from "../lib/dialPulse";
import { isTypingTarget } from "../lib/isTypingTarget";
import { dialOrder, tune } from "../lib/rooms";

export function ChatDock() {
  const isDesktop = useIsDesktop();
  const { openChannelSlug, openChannelName, openBranchSlug, collapsed, width, close, toggleCollapse, setWidth } = useChatDockStore();
  const dragging = useRef(false);
  const portalRoot = useFixedPortalRoot();
  const switcherOpen = useChatDockStore((s) => s.switcherOpen);
  useDialSync();
  useDialPulse(isDesktop);

  // Alt+1..6 tune to a preset (Alt+Shift+1..6 pins the room you are in there), Alt+[ and Alt+] step along the dial. Works with the dock closed too.
  useEffect(() => {
    if (!isDesktop) return;
    function onKey(e: KeyboardEvent) {
      const st = useChatDockStore.getState();
      // Q opens the room list from anywhere (not while typing, and not over another dialog)
      if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === "q" && !isTypingTarget(e.target) && (st.switcherOpen || !document.querySelector('[aria-modal="true"]'))) {
        e.preventDefault(); st.setSwitcher(!st.switcherOpen); return;
      }
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.code === "KeyQ" && !e.shiftKey) { e.preventDefault(); st.setSwitcher(!st.switcherOpen); return; } // the same list, also while typing
      if (e.shiftKey && e.key === "Enter") { // send the unsent draft to the next room on the dial and stay here
        const next = tune(dialOrder(st.presets, st.recents), st.openChannelSlug, 1);
        if (next) { e.preventDefault(); window.dispatchEvent(new CustomEvent(WHISPER, { detail: { slug: next.slug, name: next.name, handled: false } })); }
        return;
      }
      const m = /^Digit([1-6])$/.exec(e.code);
      if (m) { e.preventDefault(); if (e.shiftKey) st.pinRoom(Number(m[1]) - 1); else st.openSlot(Number(m[1]) - 1); return; }
      if (e.code === "BracketLeft") { e.preventDefault(); st.tuneRoom(-1); }
      else if (e.code === "BracketRight") { e.preventDefault(); st.tuneRoom(1); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDesktop]);

  const overlay = isDesktop && portalRoot && switcherOpen ? createPortal(<RoomSwitcher />, portalRoot) : null;
  if (!isDesktop || !openChannelSlug || !portalRoot) return overlay;

  function startResize(e: ReactMouseEvent) {
    e.preventDefault();
    dragging.current = true;
    function onMove(ev: MouseEvent) {
      if (!dragging.current) return;
      setWidth(window.innerWidth - ev.clientX);
    }
    function onUp() {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  if (collapsed) {
    return <>{createPortal(
      <button
        className="btn btn-primary"
        onClick={toggleCollapse}
        style={{
          position: "fixed",
          top: "50%",
          right: 0,
          transform: "translateY(-50%)",
          borderRadius: "999px 0 0 999px",
          padding: "0.6rem 0.8rem",
          zIndex: 45,
        }}
        title={`Reopen chat: ${openChannelName} (E)`}
      >
        💬 {openChannelName} <span style={{ opacity: 0.7, fontSize: "0.8em" }}>(E)</span>
      </button>,
      portalRoot,
    )}{overlay}</>;
  }

  return <>{createPortal(
    <div
      style={{
        position: "fixed",
        top: "var(--nav-height, 3.6rem)",
        right: 0,
        bottom: 0,
        width,
        background: "var(--bg)",
        borderLeft: "1px solid var(--border)",
        zIndex: 45,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div onMouseDown={startResize} title="Drag to resize" className="dock-resize-handle" />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.4rem 0.6rem",
          borderBottom: "1px solid var(--border)",
          fontFamily: "var(--font-display)",
          fontSize: "1.8rem",
          color: "var(--chat-title-color, var(--text))",
        }}
      >
        <span>
          {openBranchSlug ? (
            <Link to={branchHref(openBranchSlug)} style={{ color: "inherit", textDecoration: "none" }} title="Open in Soundbay">
              {openChannelName}
            </Link>
          ) : (
            openChannelName
          )}
        </span>
        <div style={{ display: "flex", gap: "0.3rem" }}>
          <button className="btn" style={{ padding: "0 0.4rem" }} onClick={toggleCollapse} title="Collapse">
            _
          </button>
          <button className="btn" style={{ padding: "0 0.4rem" }} onClick={close} title="Close chat">
            ×
          </button>
        </div>
      </div>
      <DialRail />
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "0 0.6rem 0.6rem" }}>
        <ChannelPage channelSlug={openChannelSlug} fillHeight />
      </div>
    </div>,
    portalRoot,
  )}{overlay}</>;
}
