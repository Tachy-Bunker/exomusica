import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAudioStore } from "../lib/audioStore";
import { renderMessageContent } from "../lib/formatMessage";
import { EmojiPicker } from "../components/EmojiPicker";
import type { Emoji } from "../lib/emojiStore";
import type { MessageDTO } from "../lib/types";

type ViewMode = "live" | "day" | "search";

function upsertMessage(list: MessageDTO[], msg: MessageDTO): MessageDTO[] {
  const idx = list.findIndex((m) => m.id === msg.id);
  if (idx === -1) return [...list, msg];
  const copy = [...list];
  copy[idx] = msg;
  return copy;
}

function MessageRow({ message, onDelete }: { message: MessageDTO; onDelete: (id: number) => void }) {
  const { user } = useAuth();
  const play = useAudioStore((s) => s.play);
  const canModerate = user && (user.id === message.authorId || user.isAdmin);
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
    <div className="message" id={`m-${message.id}`}>
      <div className="bubble">
        <div className="meta">
          <strong>
            <Link to={`/u/${message.authorUsername}`}>{message.authorUsername}</Link>
          </strong>
          <span className="mono">{new Date(message.unixTimestamp * 1000).toLocaleString()}</span>
          {message.editedAt && <span>(edited)</span>}
          {canModerate && !message.isDeleted && (
            <button className="btn btn-danger" style={{ padding: "0 0.4rem" }} onClick={() => onDelete(message.id)}>
              delete
            </button>
          )}
        </div>
        {message.isDeleted ? (
          <em style={{ color: "var(--text-dim)" }}>message deleted</em>
        ) : (
          <>
            {renderMessageContent(message.contentRaw)}
            {message.embeds.map((track) => (
              <div className="track-embed" key={track.id}>
                <button onClick={() => play(track)}>▶</button>
                <span>
                  {track.title} — <span style={{ color: "var(--text-dim)" }}>{track.albumTitle}</span>
                </span>
              </div>
            ))}
            <div style={{ marginTop: "0.3rem", display: "flex", gap: "0.4rem", alignItems: "center", position: "relative" }}>
              {message.reactions.map((r) => (
                <span key={r.emojiId} className="btn" style={{ padding: "0.1rem 0.5rem", fontSize: "0.8rem" }}>
                  :{r.emojiName}: {r.userIds.length}
                </span>
              ))}
              {user && (
                <>
                  <button
                    className="btn"
                    style={{ padding: "0.1rem 0.45rem", fontSize: "0.8rem" }}
                    onClick={() => setPickerOpen((v) => !v)}
                  >
                    +
                  </button>
                  {pickerOpen && <EmojiPicker onSelect={addReaction} />}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ChannelPage({ channelSlug }: { channelSlug?: string } = {}) {
  const params = useParams<{ slug: string }>();
  const slug = channelSlug ?? params.slug;
  const { user } = useAuth();
  const [mode, setMode] = useState<ViewMode>("live");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [archiveDays, setArchiveDays] = useState<{ day: string; messageCount: number }[]>([]);
  const [draft, setDraft] = useState("");
  const [emojiQuery, setEmojiQuery] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !slug) return;
    const dto = await api<MessageDTO>(`/api/channels/${slug}/messages`, {
      method: "POST",
      body: JSON.stringify({ contentRaw: draft }),
    });
    setMessages((prev) => upsertMessage(prev, dto)); // in case the WS event is delayed/missed
    setDraft("");
    setEmojiQuery(null);
  }

  async function handleDelete(id: number) {
    await api(`/api/messages/${id}`, { method: "DELETE" });
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, isDeleted: true, contentRaw: "", embeds: [] } : m)));
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
          <input
            placeholder="Search this topic…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button className="btn" type="submit">
            Search
          </button>
        </form>
      </div>

      <div className="message-list">
        {messages.length === 0 && <p style={{ color: "var(--text-dim)" }}>Nothing here yet.</p>}
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} onDelete={handleDelete} />
        ))}
      </div>

      {user && mode === "live" && (
        <form onSubmit={handleSend} style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", maxWidth: 720, position: "relative" }}>
          {emojiQuery !== null && <EmojiPicker filter={emojiQuery} onSelect={insertEmoji} />}
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={handleDraftChange}
            rows={2}
            style={{ flex: 1 }}
            placeholder="Write a message… (**bold**, *italic*, `code`, > quote, :emoji:, ...)"
          />
          <button className="btn btn-primary" type="submit">
            Send
          </button>
        </form>
      )}
    </div>
  );
}
