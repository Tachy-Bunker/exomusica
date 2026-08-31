import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAudioStore } from "../lib/audioStore";
import { renderMessageContent } from "../lib/formatMessage";
import { EmojiPicker } from "../components/EmojiPicker";
import type { Emoji } from "../lib/emojiStore";
import type { MessageDTO } from "../lib/types";
import { useDocumentTitle } from "../lib/useDocumentTitle";

type ViewMode = "live" | "day" | "search";
type DisplayMode = "standard" | "grouped";

interface ReplyTarget {
  id: number;
  authorUsername: string;
  excerpt: string;
}

function upsertMessage(list: MessageDTO[], msg: MessageDTO): MessageDTO[] {
  const idx = list.findIndex((m) => m.id === msg.id);
  if (idx === -1) return [...list, msg];
  const copy = [...list];
  copy[idx] = msg;
  return copy;
}

// Consecutive messages from the same author collapse into one visual group
// as long as no gap between them exceeds 5 minutes — a new box starts on
// author change or on a >5 min silence, matching Discord's convention.
const GROUP_GAP_SECONDS = 5 * 60;

function groupMessages(messages: MessageDTO[]): MessageDTO[][] {
  const groups: MessageDTO[][] = [];
  for (const m of messages) {
    const last = groups[groups.length - 1];
    const lastMsg = last?.[last.length - 1];
    if (lastMsg && lastMsg.authorId === m.authorId && m.unixTimestamp - lastMsg.unixTimestamp <= GROUP_GAP_SECONDS) {
      last.push(m);
    } else {
      groups.push([m]);
    }
  }
  return groups;
}

function ReactionRow({ message }: { message: MessageDTO }) {
  const { user } = useAuth();
  const [pickerOpen, setPickerOpen] = useState(false);

  async function addReaction(emoji: Emoji) {
    setPickerOpen(false);
    await api(`/api/messages/${message.id}/reactions`, {
      method: "POST",
      body: JSON.stringify({ emojiId: emoji.id }),
    });
    // No local optimistic update needed — the live channel is subscribed to
    // message.update events, which this reaction triggers server-side.
  }

  return (
    <div style={{ marginTop: "0.3rem", display: "flex", gap: "0.4rem", alignItems: "center", position: "relative" }}>
      {message.reactions.map((r) => (
        <span key={r.emojiId} className="btn" style={{ padding: "0.1rem 0.5rem", fontSize: "0.8rem" }} title={r.usernames.join(", ")}>
          :{r.emojiName}: {r.usernames.length}
        </span>
      ))}
      {user && (
        <>
          <button className="btn" style={{ padding: "0.1rem 0.45rem", fontSize: "0.8rem" }} onClick={() => setPickerOpen((v) => !v)}>
            +
          </button>
          {pickerOpen && <EmojiPicker onSelect={addReaction} />}
        </>
      )}
    </div>
  );
}

function MessageBody({ message, onDelete, onQuote }: { message: MessageDTO; onDelete: (id: number) => void; onQuote: (m: MessageDTO) => void }) {
  const { user } = useAuth();
  const play = useAudioStore((s) => s.play);
  const canModerate = user && (user.id === message.authorId || user.isAdmin);

  if (message.isDeleted) {
    return <em style={{ color: "var(--text-dim)" }}>message deleted</em>;
  }

  return (
    <>
      {message.replyPreview && (
        <a href={`#m-${message.replyPreview.id}`} style={{ display: "block", fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.2rem" }}>
          ↪ {message.replyPreview.authorUsername}: {message.replyPreview.excerpt}
        </a>
      )}
      {renderMessageContent(message.contentRaw)}
      {message.embeds.map((track) => (
        <div className="track-embed" key={track.id}>
          <button onClick={() => play(track)}>▶</button>
          <span>
            {track.title} — <span style={{ color: "var(--text-dim)" }}>{track.albumTitle}</span>
          </span>
        </div>
      ))}
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
        <ReactionRow message={message} />
        {user && (
          <button className="btn" style={{ padding: "0.1rem 0.45rem", fontSize: "0.75rem" }} onClick={() => onQuote(message)}>
            Quote
          </button>
        )}
        {canModerate && (
          <button className="btn btn-danger" style={{ padding: "0.1rem 0.45rem", fontSize: "0.75rem" }} onClick={() => onDelete(message.id)}>
            delete
          </button>
        )}
      </div>
    </>
  );
}

// Standard view: every message is its own bordered box with full header.
function StandardMessage({ message, onDelete, onQuote }: { message: MessageDTO; onDelete: (id: number) => void; onQuote: (m: MessageDTO) => void }) {
  return (
    <div className="message" id={`m-${message.id}`}>
      <div className="bubble">
        <div className="meta">
          <strong>
            <Link to={`/u/${message.authorUsername}`}>{message.authorUsername}</Link>
          </strong>
          <span className="mono">{new Date(message.unixTimestamp * 1000).toLocaleString()}</span>
          {message.editedAt && <span>(edited)</span>}
        </div>
        <MessageBody message={message} onDelete={onDelete} onQuote={onQuote} />
      </div>
    </div>
  );
}

// Grouped view: one header (avatar/name/first timestamp) per consecutive
// run from the same author, each message inside stacked without repeating it.
function MessageGroup({ group, onDelete, onQuote }: { group: MessageDTO[]; onDelete: (id: number) => void; onQuote: (m: MessageDTO) => void }) {
  const first = group[0];
  return (
    <div className="message">
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          flexShrink: 0,
          background: first.authorAvatarUrl ? `url(${first.authorAvatarUrl}) center/cover` : "var(--bg-elevated)",
        }}
      />
      <div className="bubble" style={{ background: "transparent", padding: 0 }}>
        <div className="meta">
          <strong>
            <Link to={`/u/${first.authorUsername}`}>{first.authorUsername}</Link>
          </strong>
          <span className="mono">{new Date(first.unixTimestamp * 1000).toLocaleString()}</span>
        </div>
        {group.map((m) => (
          <div key={m.id} id={`m-${m.id}`} style={{ marginBottom: "0.3rem" }}>
            <MessageBody message={m} onDelete={onDelete} onQuote={onQuote} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChannelPage({ channelSlug }: { channelSlug?: string } = {}) {
  const params = useParams<{ slug: string }>();
  const slug = channelSlug ?? params.slug;
  const { user } = useAuth();
  const [mode, setMode] = useState<ViewMode>("live");
  const [displayMode, setDisplayMode] = useState<DisplayMode>(
    () => (localStorage.getItem("exomusica_display_mode") as DisplayMode) ?? "standard",
  );
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [archiveDays, setArchiveDays] = useState<{ day: string; messageCount: number }[]>([]);
  const [draft, setDraft] = useState("");
  const [emojiQuery, setEmojiQuery] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [channelName, setChannelName] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  useDocumentTitle(channelName ?? "");
  const wsRef = useRef<WebSocket | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function toggleDisplayMode() {
    const next = displayMode === "standard" ? "grouped" : "standard";
    setDisplayMode(next);
    localStorage.setItem("exomusica_display_mode", next);
  }

  useEffect(() => {
    if (!slug || !user) return;
    api<{ following: boolean }>(`/api/channels/${slug}/follow`).then((r) => setFollowing(r.following));
  }, [slug, user]);

  async function toggleFollow() {
    if (!slug) return;
    await api(`/api/channels/${slug}/follow`, { method: following ? "DELETE" : "POST" });
    setFollowing(!following);
  }

  useEffect(() => {
    if (!slug) return;
    api<{ name: string }>(`/api/channels/${slug}`).then((c) => setChannelName(c.name));
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    api<{ day: string; messageCount: number }[]>(`/api/channels/${slug}/archive`).then(setArchiveDays);
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    const params = new URLSearchParams();
    if (mode === "day" && selectedDay) params.set("day", selectedDay);
    if (mode === "search" && activeSearch) params.set("q", activeSearch);
    api<MessageDTO[]>(`/api/channels/${slug}/messages?${params}`).then(setMessages);
  }, [slug, mode, selectedDay, activeSearch]);

  // Only the live view stays subscribed — browsing history or search
  // shouldn't be interrupted by new messages arriving underneath you.
  useEffect(() => {
    if (!slug || mode !== "live") return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/${slug}`);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const event = JSON.parse(ev.data);
      if (event.type === "message.create" || event.type === "message.update") {
        setMessages((prev) => upsertMessage(prev, event.message));
      } else if (event.type === "message.delete") {
        setMessages((prev) =>
          prev.map((m) => (m.id === event.messageId ? { ...m, isDeleted: true, contentRaw: "", embeds: [] } : m)),
        );
      }
    };
    return () => ws.close();
  }, [slug, mode]);

  async function sendMessage() {
    if (!draft.trim() || !slug) return;
    const dto = await api<MessageDTO>(`/api/channels/${slug}/messages`, {
      method: "POST",
      body: JSON.stringify({ contentRaw: draft, replyToId: replyTarget?.id }),
    });
    setMessages((prev) => upsertMessage(prev, dto)); // in case the WS event is delayed/missed
    setDraft("");
    setEmojiQuery(null);
    setReplyTarget(null);
  }

  function handleSend(e: FormEvent) {
    e.preventDefault();
    void sendMessage();
  }

  async function handleDelete(id: number) {
    await api(`/api/messages/${id}`, { method: "DELETE" });
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, isDeleted: true, contentRaw: "", embeds: [] } : m)));
  }

  function handleQuote(m: MessageDTO) {
    setReplyTarget({ id: m.id, authorUsername: m.authorUsername, excerpt: m.contentRaw.slice(0, 80) });
    textareaRef.current?.focus();
  }

  // Detects an in-progress ":partial" fragment right before the cursor and
  // opens the picker filtered to it. Doesn't try to float at the cursor's
  // exact pixel position (needs a textarea-mirroring technique) — it just
  // anchors above the composer, which is a fair simplification here.
  function handleDraftChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setDraft(value);
    const cursor = e.target.selectionStart ?? value.length;
    const match = value.slice(0, cursor).match(/:([a-z0-9_]*)$/i);
    setEmojiQuery(match ? match[1] : null);
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const el = textareaRef.current;
    if (!el) return;
    const pasted = e.clipboardData.getData("text").trim();
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const hasSelection = start !== end;
    const isUrl = /^https?:\/\/\S+$/.test(pasted);
    if (!hasSelection || !isUrl) return; // let the default paste happen

    e.preventDefault();
    const selectedText = draft.slice(start, end);
    const next = `${draft.slice(0, start)}[${selectedText}](${pasted})${draft.slice(end)}`;
    setDraft(next);
    requestAnimationFrame(() => {
      el.focus();
      const newCursor = start + selectedText.length + pasted.length + 4;
      el.setSelectionRange(newCursor, newCursor);
    });
  }

  function insertEmoji(emoji: Emoji) {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? draft.length;
    const match = draft.slice(0, cursor).match(/:([a-z0-9_]*)$/i);
    if (!match) return;
    const start = cursor - match[0].length;
    const next = `${draft.slice(0, start)}:${emoji.name}: ${draft.slice(cursor)}`;
    setDraft(next);
    setEmojiQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      const newCursor = start + emoji.name.length + 3;
      el.setSelectionRange(newCursor, newCursor);
    });
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "0.6rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <button className={`btn ${mode === "live" ? "btn-primary" : ""}`} onClick={() => setMode("live")}>
          Live
        </button>
        {user && (
          <button className="btn" onClick={toggleFollow}>
            {following ? "Following ✓" : "Follow"}
          </button>
        )}
        <button className="btn" onClick={toggleDisplayMode} title="Toggle grouped consecutive messages">
          {displayMode === "grouped" ? "Grouped view" : "Standard view"}
        </button>
        <select
          className="btn"
          value={mode === "day" ? selectedDay ?? "" : ""}
          onChange={(e) => {
            setSelectedDay(e.target.value);
            setMode("day");
          }}
        >
          <option value="" disabled>
            Browse archive…
          </option>
          {archiveDays.map((d) => (
            <option key={d.day} value={d.day}>
              {d.day} ({d.messageCount})
            </option>
          ))}
        </select>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setActiveSearch(searchInput);
            setMode("search");
          }}
          style={{ display: "flex", gap: "0.4rem" }}
        >
          <input placeholder="Search this topic…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          <button className="btn" type="submit">
            Search
          </button>
        </form>
      </div>

      <div className="message-list">
        {messages.length === 0 && <p style={{ color: "var(--text-dim)" }}>Nothing here yet.</p>}
        {displayMode === "standard"
          ? messages.map((m) => <StandardMessage key={m.id} message={m} onDelete={handleDelete} onQuote={handleQuote} />)
          : groupMessages(messages).map((g) => (
              <MessageGroup key={g[0].id} group={g} onDelete={handleDelete} onQuote={handleQuote} />
            ))}
      </div>

      {user && mode === "live" && (
        <form onSubmit={handleSend} style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.4rem", maxWidth: 720, position: "relative" }}>
          {replyTarget && (
            <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", display: "flex", gap: "0.4rem", alignItems: "center" }}>
              Replying to <strong>{replyTarget.authorUsername}</strong>: {replyTarget.excerpt}
              <button className="btn" style={{ padding: "0 0.4rem" }} onClick={() => setReplyTarget(null)}>
                ×
              </button>
            </div>
          )}
          <div style={{ display: "flex", gap: "0.5rem", position: "relative" }}>
            {emojiQuery !== null && <EmojiPicker filter={emojiQuery} onSelect={insertEmoji} />}
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={handleDraftChange}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              rows={2}
              style={{ flex: 1 }}
              placeholder="Write a message… (**bold**, *italic*, `code`, > quote, :emoji:, Ctrl+Enter to send)"
            />
            <button className="btn btn-primary" type="submit">
              Send
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
