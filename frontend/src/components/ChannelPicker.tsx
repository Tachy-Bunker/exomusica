import { useEffect, useState } from "react";
import { api } from "../lib/api";

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

interface Props {
  /** The chat the study is connected to now, if any. */
  currentSlug: string | null;
  /** Connect to an existing chat (a branch's or a topic's), by the chat's own address. */
  onPick: (channelSlug: string) => Promise<void>;
  /** Give the study a fresh chat of its own. */
  onNewChat: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onClose: () => void;
}

/** Choose which chat a study is connected to, searching branches and topics the same way the Location menu does. */
export function ChannelPicker({ currentSlug, onPick, onNewChat, onDisconnect, onClose }: Props) {
  const [branches, setBranches] = useState<SwitchableBranch[] | null>(null);
  const [topics, setTopics] = useState<SwitchableTopic[] | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<SwitchableBranch[]>("/api/branches").then(setBranches).catch(() => setBranches([]));
    api<SwitchableTopic[]>("/api/channels?kind=DISCUSSION").then(setTopics).catch(() => setTopics([]));
  }, []);

  const q = query.trim().toLowerCase();
  const shownBranches = (branches ?? [])
    .filter((b) => !!b.channel && b.name.toLowerCase().includes(q))
    .sort((a, b) => (b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0) - (a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0)); // most recent activity first, like the Location menu
  const shownTopics = (topics ?? []).filter((t) => t.name.toLowerCase().includes(q)).sort((a, b) => a.position - b.position);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
      setBusy(false);
    }
  }

  const item = (key: string, slug: string, name: string, hint?: string) => (
    <button key={key} type="button" className={`btn channel-picker-item${slug === currentSlug ? " active" : ""}`} disabled={busy} data-testid={`pick-${slug}`} onClick={() => void run(() => onPick(slug))}>
      <span>{name}</span>
      {hint && <span className="channel-picker-hint">{hint}</span>}
      {slug === currentSlug && <span aria-label="connected now">✓</span>}
    </button>
  );

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div role="dialog" aria-label="Choose this study's chat" onClick={(e) => e.stopPropagation()} className="channel-picker" data-testid="channel-picker">
        <h3 style={{ marginTop: 0 }}>Where should this study's discussion happen?</h3>
        <input autoFocus placeholder="Search branches and topics…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: "100%", marginBottom: "0.5rem" }} aria-label="Search chats" />
        <div className="channel-picker-list">
          {(branches === null || topics === null) && <p className="channel-picker-hint">Loading…</p>}
          {shownBranches.length > 0 && <div className="channel-picker-head">Branches</div>}
          {shownBranches.map((b) => item(`b-${b.slug}`, b.channel!.slug, b.name, b.visibility === "BABY_CRYSTALS" ? "growing seed" : undefined))}
          {shownTopics.length > 0 && <div className="channel-picker-head">Topics</div>}
          {shownTopics.map((t) => item(`t-${t.slug}`, t.slug, t.name, t.category ?? undefined))}
          {branches !== null && topics !== null && shownBranches.length === 0 && shownTopics.length === 0 && <p className="channel-picker-hint">No matches.</p>}
        </div>
        {error && <p className="voice-note-warn" role="alert" data-testid="channel-picker-error">{error}</p>}
        <div className="voice-note-row" style={{ marginTop: "0.6rem" }}>
          <button type="button" className="btn" disabled={busy} onClick={() => void run(onNewChat)} data-testid="pick-new">
            + Create a new chat for this study
          </button>
          {currentSlug && (
            <button type="button" className="btn" disabled={busy} onClick={() => void run(onDisconnect)} data-testid="pick-none">
              No chat
            </button>
          )}
          <button type="button" className="btn" onClick={onClose} style={{ marginLeft: "auto" }}>
            Cancel
          </button>
        </div>
        <p className="channel-picker-hint" style={{ marginBottom: 0 }}>The chat you leave keeps all its messages. Several studies can share one chat.</p>
      </div>
    </div>
  );
}
