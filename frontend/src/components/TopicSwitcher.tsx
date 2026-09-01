import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { usePresenceStore } from "../lib/presenceStore";
import { useChatDockStore } from "../lib/chatDockStore";
import { useIsDesktop } from "../lib/useIsDesktop";

interface SwitchableBranch {
  slug: string;
  name: string;
  lastActivityAt: string | null;
  channel: { slug: string } | null;
}

export function TopicSwitcher({ label = "Switch topic" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<SwitchableBranch[]>([]);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const openChat = useChatDockStore((s) => s.openChat);
  const viewersByChannel = usePresenceStore((s) => s.viewersByChannel);

  useEffect(() => {
    if (open) api<SwitchableBranch[]>("/api/branches").then(setBranches);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  const filtered = branches
    .filter((b) => !!b.channel)
    .filter((b) => b.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const at = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
      const bt = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      return bt - at; // most recent activity first, by default
    });

  function select(b: SwitchableBranch) {
    setOpen(false);
    setQuery("");
    if (isDesktop) openChat(b.channel!.slug, b.name);
    else navigate(`/branch/${b.slug}`);
  }

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      <button className="btn" onClick={() => setOpen((v) => !v)}>
        {label}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "0.3rem",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "0.4rem",
            width: 240,
            maxHeight: 320,
            overflowY: "auto",
            zIndex: 30,
            boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
          }}
        >
          <input
            autoFocus
            placeholder="Search branches…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: "100%", marginBottom: "0.3rem" }}
          />
          {filtered.length === 0 && <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>No matches.</p>}
          {filtered.map((b) => {
            const hasViewers = !!b.channel && viewersByChannel.has(b.channel.slug);
            return (
              <button
                key={b.slug}
                className="btn"
                onClick={() => select(b)}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem", width: "100%", textAlign: "left", marginBottom: "0.15rem" }}
              >
                {hasViewers && <span className="presence-pulse" title="Someone's here" />}
                {b.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
