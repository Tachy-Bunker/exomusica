import { useEffect, useState } from "react";
import { MiniChat } from "./MiniChat";
import { useChatDockStore } from "../lib/chatDockStore";
import { api } from "../lib/api";

interface ChannelOption {
  slug: string;
  name: string;
}

export function PopoutChatContent({ initialSlug, initialName }: { initialSlug?: string | null; initialName?: string | null }) {
  const dockChannelSlug = useChatDockStore((s) => s.openChannelSlug);
  const dockChannelName = useChatDockStore((s) => s.openChannelName);

  const [followDock, setFollowDock] = useState(!initialSlug);
  const [manualSlug, setManualSlug] = useState<string | null>(initialSlug ?? null);
  const [manualName, setManualName] = useState<string | null>(initialName ?? null);
  const [query, setQuery] = useState("");
  const [allChannels, setAllChannels] = useState<ChannelOption[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  // Cross-window live-follow: zustand's persist middleware writes to
  // localStorage but doesn't auto-sync across separate windows/tabs —
  // the native `storage` event only fires in *other* windows than the
  // one that made the change, which is exactly this window's situation
  // relative to the main one. Re-hydrating on that event is what makes
  // "same as chatbox" actually live-update when the main window's dock
  // switches to a different channel.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "exomusica_chat_dock") {
        useChatDockStore.persist.rehydrate();
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (followDock) return;
    api<ChannelOption[]>("/api/channels").then(setAllChannels).catch(() => setAllChannels([]));
  }, [followDock]);

  // Show every topic when no search text has been entered yet, not an
  // empty list — narrows as the user actually types.
  const q = query.trim().toLowerCase();
  const results = (q ? allChannels.filter((c) => c.name.toLowerCase().includes(q)) : allChannels).slice(0, 30);

  const activeSlug = followDock ? dockChannelSlug : manualSlug;
  const activeName = followDock ? dockChannelName : manualName;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "var(--font-body)", color: "var(--text)", background: "var(--bg)" }}>
      <div style={{ padding: "0.4rem 0.6rem", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem" }}>
          <input type="checkbox" checked={followDock} onChange={(e) => setFollowDock(e.target.checked)} />
          Same as chatbox
        </label>
        {!followDock && (
          <div style={{ position: "relative" }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              placeholder="Search topics…"
              style={{ width: "100%", background: "var(--bg-inset)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--text)", padding: "0.3rem 0.4rem", fontSize: "0.8rem" }}
            />
            {searchOpen && results.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 5, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius)", maxHeight: 200, overflowY: "auto" }}>
                {results.map((c) => (
                  <div
                    key={c.slug}
                    onClick={() => {
                      setManualSlug(c.slug);
                      setManualName(c.name);
                      setQuery("");
                      setSearchOpen(false);
                    }}
                    style={{ padding: "0.3rem 0.5rem", fontSize: "0.8rem", cursor: "pointer" }}
                  >
                    {c.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {activeSlug ? (
          <MiniChat slug={activeSlug} channelName={activeName ?? activeSlug} />
        ) : (
          <p style={{ padding: "1rem", fontSize: "0.85rem", color: "var(--text-dim)" }}>
            {followDock ? "No chat currently open in the main chatbox." : "Search for a topic above."}
          </p>
        )}
      </div>
    </div>
  );
}
