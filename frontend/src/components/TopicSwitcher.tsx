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
  visibility?: "VISIBLE" | "HIDDEN" | "BABY_CRYSTALS";
}

interface SwitchableTopic {
  slug: string;
  name: string;
  category: string | null;
  position: number;
}

export function TopicSwitcher({ label = "Location" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<SwitchableBranch[]>([]);
  const [topics, setTopics] = useState<SwitchableTopic[]>([]);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const openChat = useChatDockStore((s) => s.openChat);
  const viewersByChannel = usePresenceStore((s) => s.viewersByChannel);

  useEffect(() => {
    if (!open) return;
    api<SwitchableBranch[]>("/api/branches").then(setBranches);
    api<SwitchableTopic[]>("/api/channels?kind=DISCUSSION").then(setTopics);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  const filteredBranches = branches
    .filter((b) => !!b.channel)
    .filter((b) => b.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const at = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
      const bt = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      return bt - at; // most recent activity first, by default
    });

  const filteredTopics = topics
    .filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.position - b.position); // admin-defined order

  // Group topics by category, preserving each category's own admin-defined
  // order (categories appear in the order their first topic appears).
  const topicsByCategory = new Map<string, SwitchableTopic[]>();
  for (const t of filteredTopics) {
    const key = t.category ?? "";
    if (!topicsByCategory.has(key)) topicsByCategory.set(key, []);
    topicsByCategory.get(key)!.push(t);
  }

  function selectBranch(b: SwitchableBranch) {
    setOpen(false);
    setQuery("");
    if (isDesktop) openChat(b.channel!.slug, b.name, b.slug);
    else navigate(`/branch/${b.slug}`);
  }

  function selectTopic(t: SwitchableTopic) {
    setOpen(false);
    setQuery("");
    if (isDesktop) openChat(t.slug, t.name);
    else navigate(`/topic/${t.slug}`);
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
            width: 260,
            maxHeight: 360,
            overflowY: "auto",
            zIndex: 30,
            boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
          }}
        >
          <input
            autoFocus={isDesktop}
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: "100%", marginBottom: "0.3rem" }}
          />

          {filteredBranches.length === 0 && filteredTopics.length === 0 && (
            <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>No matches.</p>
          )}

          {filteredBranches.filter((b) => b.visibility !== "BABY_CRYSTALS").length > 0 && (
            <div style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "var(--text-dim)", margin: "0.3rem 0 0.15rem" }}>
              Branches
            </div>
          )}
          {filteredBranches
            .filter((b) => b.visibility !== "BABY_CRYSTALS")
            .map((b) => {
              const hasViewers = !!b.channel && viewersByChannel.has(b.channel.slug);
              return (
                <button
                  key={b.slug}
                  className="btn"
                  onClick={() => selectBranch(b)}
                  style={{ display: "flex", alignItems: "center", gap: "0.4rem", width: "100%", textAlign: "left", marginBottom: "0.15rem" }}
                >
                  {hasViewers && <span className="presence-pulse" title="Someone's here" />}
                  {b.name}
                </button>
              );
            })}

          {filteredBranches.filter((b) => b.visibility === "BABY_CRYSTALS").length > 0 && (
            <div style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "var(--text-dim)", margin: "0.5rem 0 0.15rem" }}>
              Growing Seeds
            </div>
          )}
          {filteredBranches
            .filter((b) => b.visibility === "BABY_CRYSTALS")
            .map((b) => {
              const hasViewers = !!b.channel && viewersByChannel.has(b.channel.slug);
              return (
                <button
                  key={b.slug}
                  className="btn"
                  onClick={() => selectBranch(b)}
                  style={{ display: "flex", alignItems: "center", gap: "0.4rem", width: "100%", textAlign: "left", marginBottom: "0.15rem" }}
                >
                  {hasViewers && <span className="presence-pulse" title="Someone's here" />}
                  {b.name}
                </button>
              );
            })}

          {[...topicsByCategory.entries()].map(([category, items]) => (
            <div key={category || "uncategorized"}>
              <div style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "var(--text-dim)", margin: "0.5rem 0 0.15rem" }}>
                {category || "Forum topics"}
              </div>
              {items.map((t) => {
                const hasViewers = viewersByChannel.has(t.slug);
                return (
                  <button
                    key={t.slug}
                    className="btn"
                    onClick={() => selectTopic(t)}
                    style={{ display: "flex", alignItems: "center", gap: "0.4rem", width: "100%", textAlign: "left", marginBottom: "0.15rem" }}
                  >
                    {hasViewers && <span className="presence-pulse" title="Someone's here" />}
                    {t.name}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
