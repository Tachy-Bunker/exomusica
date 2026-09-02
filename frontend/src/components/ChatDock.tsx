import { useRef } from "react";
import { createPortal } from "react-dom";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Link } from "react-router-dom";
import { useChatDockStore } from "../lib/chatDockStore";
import { useIsDesktop } from "../lib/useIsDesktop";
import { ChannelPage } from "../pages/ChannelPage";
import { useFixedPortalRoot } from "../lib/useFixedPortalRoot";

export function ChatDock() {
  const isDesktop = useIsDesktop();
  const { openChannelSlug, openChannelName, openBranchSlug, collapsed, width, close, toggleCollapse, setWidth } = useChatDockStore();
  const dragging = useRef(false);
  const portalRoot = useFixedPortalRoot();

  if (!isDesktop || !openChannelSlug || !portalRoot) return null;

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
    return createPortal(
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
        title={`Reopen chat: ${openChannelName}`}
      >
        💬 {openChannelName}
      </button>,
      portalRoot,
    );
  }

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: "var(--nav-height, 3.6rem)",
        right: 0,
        bottom: "var(--player-height, 0px)",
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
            <Link to={`/branch/${openBranchSlug}`} style={{ color: "inherit", textDecoration: "none" }} title="Open branch page">
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
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "0 0.6rem 0.6rem" }}>
        <ChannelPage channelSlug={openChannelSlug} fillHeight />
      </div>
    </div>,
    portalRoot,
  );
}
