import { useEffect, useRef, useState } from "react";
import { useIsDesktop } from "../lib/useIsDesktop";

interface Props {
  title: string;
  composer: string;
  rootGenre: string;
  genres: string[];
  description: string | null;
  onClose: () => void;
}

export function ConstellationScanPanel({ title, composer, rootGenre, genres, description, onClose }: Props) {
  const isDesktop = useIsDesktop();
  const [collapsed, setCollapsed] = useState(!isDesktop);
  const [size, setSize] = useState({ width: isDesktop ? 340 : 260, height: isDesktop ? 260 : 200 });
  const [revealed, setRevealed] = useState(0);
  const dragRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  const fullText = description ?? "";

  // Scans the description in character by character, like a Metroid
  // Prime logbook entry - resets and restarts whenever the track
  // changes, so re-selecting the same track re-plays the scan too.
  useEffect(() => {
    setRevealed(0);
    if (!fullText) return;
    const interval = setInterval(() => {
      setRevealed((r) => {
        if (r >= fullText.length) {
          clearInterval(interval);
          return r;
        }
        return r + 2;
      });
    }, 16);
    return () => clearInterval(interval);
  }, [fullText, title]);

  function handleResizeStart(e: React.PointerEvent) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startW: size.width, startH: size.height };
    function onMove(ev: PointerEvent) {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setSize({
        width: Math.max(220, Math.min(560, dragRef.current.startW + dx)),
        height: Math.max(140, Math.min(520, dragRef.current.startH + dy)),
      });
    }
    function onUp() {
      dragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 6,
        width: collapsed ? "auto" : size.width,
        maxWidth: "calc(100% - 24px)",
        background: "rgba(8, 14, 24, 0.92)",
        border: "1px solid #4fd4c4",
        borderRadius: "var(--radius)",
        boxShadow: "0 0 18px rgba(79, 212, 196, 0.35), inset 0 0 30px rgba(79, 212, 196, 0.05)",
        fontFamily: "var(--font-mono, monospace)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          padding: "0.4rem 0.6rem",
          cursor: "pointer",
          borderBottom: collapsed ? "none" : "1px solid rgba(79, 212, 196, 0.3)",
          background: "rgba(79, 212, 196, 0.08)",
        }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span style={{ fontSize: "0.72rem", color: "#4fd4c4", letterSpacing: "0.05em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          ◈ {title}
        </span>
        <span style={{ display: "flex", gap: "0.3rem", flexShrink: 0 }}>
          <button
            className="btn"
            style={{ fontSize: "0.65rem", padding: "0 0.3rem" }}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            ×
          </button>
        </span>
      </div>

      {!collapsed && (
        <div style={{ height: size.height, display: "flex", flexDirection: "column", position: "relative" }}>
          <div style={{ padding: "0.6rem", overflowY: "auto", flex: 1, fontSize: "0.78rem", color: "#d8f5f0" }}>
            <p style={{ margin: "0 0 0.4rem", color: "var(--text-dim)" }}>{composer}</p>
            <p style={{ margin: "0 0 0.5rem" }}>
              <span style={{ color: "#4fd4c4" }}>ROOT ⁘</span> {rootGenre}
              {genres.length > 1 && (
                <>
                  <br />
                  <span style={{ color: "#4fd4c4" }}>LINKED ⁘</span> {genres.slice(1).join(", ")}
                </>
              )}
            </p>
            {fullText ? (
              <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                {fullText.slice(0, revealed)}
                {revealed < fullText.length && <span style={{ opacity: 0.6 }}>▌</span>}
              </p>
            ) : (
              <p style={{ color: "var(--text-dim)", fontStyle: "italic" }}>No log entry for this track.</p>
            )}
          </div>
          <div
            onPointerDown={handleResizeStart}
            style={{
              position: "absolute",
              bottom: 0,
              right: 0,
              width: 16,
              height: 16,
              cursor: "nwse-resize",
              background: "linear-gradient(135deg, transparent 50%, rgba(79, 212, 196, 0.4) 50%)",
            }}
          />
        </div>
      )}
    </div>
  );
}
