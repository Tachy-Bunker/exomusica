import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAudioStore } from "../lib/audioStore";
import { renderMessageContent } from "../lib/formatMessage";
import { EmojiPicker } from "../components/EmojiPicker";
import { AttachmentPreview } from "../components/AttachmentPreview";
import { ArchiveCalendar } from "../components/ArchiveCalendar";
import { SearchBox } from "../components/SearchBox";
import { useEmojiStore, type Emoji } from "../lib/emojiStore";
import type { MessageDTO } from "../lib/types";
import { createPortal } from "react-dom";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useCustomFont, type FontInfo } from "../lib/useCustomFont";
import { MiniChat } from "../components/MiniChat";

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

function ReactionPills({ message }: { message: MessageDTO }) {
  const emojis = useEmojiStore((s) => s.emojis);
  if (message.reactions.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.35rem" }} onClick={(e) => e.stopPropagation()}>
      {message.reactions.map((r) => {
        const known = emojis.find((e) => e.name === r.emojiName);
        return (
          <span key={r.emojiId} className="reaction-pill" title={r.usernames.join(", ")}>
            {known ? <img src={known.imageUrl} alt={r.emojiName} className="emoji-inline" /> : `:${r.emojiName}:`} {r.usernames.length}
          </span>
        );
      })}
    </div>
  );
}

function MessageMenu({
  message,
  onDelete,
  onQuote,
  onCopyLink,
  canModerate,
}: {
  message: MessageDTO;
  onDelete: (id: number) => void;
  onQuote: (m: MessageDTO) => void;
  onCopyLink: (m: MessageDTO) => void;
  canModerate: boolean;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reacting, setReacting] = useState(false);

  async function addReaction(emoji: Emoji) {
    setReacting(false);
    setOpen(false);
    await api(`/api/messages/${message.id}/reactions`, { method: "POST", body: JSON.stringify({ emojiId: emoji.id }) });
    // No local optimistic update needed — the live channel is subscribed to
    // message.update events, which this reaction triggers server-side.
  }

  return (
    <div className="message-menu" onClick={(e) => e.stopPropagation()}>
      <button className="btn message-menu-trigger" onClick={() => setOpen((v) => !v)} title="More">
        ⋮
      </button>
      {open && (
        <div className="message-menu-dropdown">
          {user && (
            <div style={{ position: "relative" }}>
              <button className="btn" style={{ width: "100%", textAlign: "left" }} onClick={() => setReacting((v) => !v)}>
                React
              </button>
              {reacting && <EmojiPicker onSelect={addReaction} />}
            </div>
          )}
          {user && (
            <button
              className="btn"
              style={{ width: "100%", textAlign: "left" }}
              onClick={() => {
                setOpen(false);
                onQuote(message);
              }}
            >
              Quote
            </button>
          )}
          <button
            className="btn"
            style={{ width: "100%", textAlign: "left" }}
            onClick={() => {
              setOpen(false);
              onCopyLink(message);
            }}
          >
            Copy link
          </button>
          {canModerate && (
            <button
              className="btn btn-danger"
              style={{ width: "100%", textAlign: "left" }}
              onClick={() => {
                setOpen(false);
                onDelete(message.id);
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MessageBody({
  message,
  onDelete,
  onQuote,
  onCopyLink,
}: {
  message: MessageDTO;
  onDelete: (id: number) => void;
  onQuote: (m: MessageDTO) => void;
  onCopyLink: (m: MessageDTO) => void;
}) {
  const { user } = useAuth();
  const play = useAudioStore((s) => s.play);
  const canModerate = !!user && (user.id === message.authorId || user.isAdmin);

  if (message.isDeleted) {
    return <em style={{ color: "var(--text-dim)" }}>message deleted</em>;
  }

  return (
    <div style={{ position: "relative" }}>
      <MessageMenu message={message} onDelete={onDelete} onQuote={onQuote} onCopyLink={onCopyLink} canModerate={canModerate} />
      {message.replyPreview && (
        <a href={`#m-${message.replyPreview.id}`} style={{ display: "block", fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.2rem" }}>
          ↪ {message.replyPreview.authorUsername}: {message.replyPreview.excerpt}
        </a>
      )}
      <div style={{ paddingRight: "1.6rem" }}>{renderMessageContent(message.contentRaw)}</div>
      {message.embeds.map((track) => (
        <div className="track-embed" key={track.id} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => play(track)}>▶</button>
          <span>
            {track.title} — <span style={{ color: "var(--text-dim)" }}>{track.albumTitle}</span>
          </span>
        </div>
      ))}
      {message.attachments.map((a) => (
        <AttachmentPreview key={a.id} attachment={a} />
      ))}
      <ReactionPills message={message} />
    </div>
  );
}

// Standard view: every message is its own bordered box with full header.
function StandardMessage({
  message,
  onDelete,
  onQuote,
  onCopyLink,
}: {
  message: MessageDTO;
  onDelete: (id: number) => void;
  onQuote: (m: MessageDTO) => void;
  onCopyLink: (m: MessageDTO) => void;
}) {
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
        <MessageBody message={message} onDelete={onDelete} onQuote={onQuote} onCopyLink={onCopyLink} />
      </div>
    </div>
  );
}

// Grouped view: one header (avatar/name/first timestamp) per consecutive
// run from the same author, each message inside stacked without repeating it.
function MessageGroup({
  group,
  onDelete,
  onQuote,
  onCopyLink,
}: {
  group: MessageDTO[];
  onDelete: (id: number) => void;
  onQuote: (m: MessageDTO) => void;
  onCopyLink: (m: MessageDTO) => void;
}) {
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
          <div key={m.id} id={`m-${m.id}`}>
            <MessageBody message={m} onDelete={onDelete} onQuote={onQuote} onCopyLink={onCopyLink} />
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
  const [activeSearch, setActiveSearch] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [archiveDays, setArchiveDays] = useState<{ day: string; messageCount: number }[]>([]);
  const [draft, setDraft] = useState("");
  const [emojiQuery, setEmojiQuery] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [channelName, setChannelName] = useState<string | null>(null);
  const [channelFont, setChannelFont] = useState<FontInfo | null>(null);
  const fontFamily = useCustomFont(channelFont);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<{ id: number; filename: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [pendingScrollTo, setPendingScrollTo] = useState<number | null>(null);

  async function popOutChat() {
    if (!slug) return;
    // Document Picture-in-Picture: a real always-on-top window, enforced by
    // the browser, that stays visible over *any* application — not just
    // other browser tabs. Chrome/Edge only; Firefox and Safari fall back to
    // a plain popup, which is still a separate OS window but can't be
    // forced above other apps (no website can do that, by design).
    const dpip = (window as unknown as { documentPictureInPicture?: { requestWindow: (opts: { width: number; height: number }) => Promise<Window> } }).documentPictureInPicture;
    if (dpip) {
      const pip = await dpip.requestWindow({ width: 340, height: 480 });
      [...document.styleSheets].forEach((sheet) => {
        try {
          const rules = [...sheet.cssRules].map((r) => r.cssText).join("\n");
          const style = pip.document.createElement("style");
          style.textContent = rules;
          pip.document.head.appendChild(style);
        } catch {
          if (sheet.href) {
            const link = pip.document.createElement("link");
            link.rel = "stylesheet";
            link.href = sheet.href;
            pip.document.head.appendChild(link);
          }
        }
      });
      pip.document.body.style.margin = "0";
      pip.addEventListener("pagehide", () => setPipWindow(null));
      setPipWindow(pip);
    } else {
      window.open(`/topic/${slug}`, "_blank", "popup=1,width=380,height=560");
    }
  }
  const [searchParams] = useSearchParams();

  // Landing here via a "copy link" URL (?day=YYYY-MM-DD#m-123): jump
  // straight to that day and scroll to the message once it's loaded.
  useEffect(() => {
    const day = searchParams.get("day");
    const hash = window.location.hash;
    if (day) {
      setSelectedDay(day);
      setMode("day");
    }
    if (hash.startsWith("#m-")) {
      setPendingScrollTo(Number(hash.slice(3)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pendingScrollTo === null) return;
    const el = document.getElementById(`m-${pendingScrollTo}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("message-highlight");
      setTimeout(() => el.classList.remove("message-highlight"), 2000);
      setPendingScrollTo(null);
    }
  }, [messages, pendingScrollTo]);

  function dayKeyOf(m: MessageDTO): string {
    return new Date(m.unixTimestamp * 1000).toISOString().slice(0, 10);
  }

  function handleCopyLink(m: MessageDTO) {
    const today = new Date().toISOString().slice(0, 10);
    const day = dayKeyOf(m);
    const url = day === today
      ? `${location.origin}/topic/${slug}#m-${m.id}`
      : `${location.origin}/topic/${slug}?day=${day}#m-${m.id}`;
    navigator.clipboard.writeText(url);
  }

  function jumpToMessage(m: MessageDTO) {
    const today = new Date().toISOString().slice(0, 10);
    if (dayKeyOf(m) === today) {
      setMode("live");
    } else {
      setSelectedDay(dayKeyOf(m));
      setMode("day");
    }
    setPendingScrollTo(m.id);
  }
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
    api<{ name: string; font: FontInfo | null }>(`/api/channels/${slug}`).then((c) => {
      setChannelName(c.name);
      setChannelFont(c.font);
    });
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
    if ((!draft.trim() && pendingAttachments.length === 0) || !slug) return;
    const dto = await api<MessageDTO>(`/api/channels/${slug}/messages`, {
      method: "POST",
      body: JSON.stringify({
        contentRaw: draft,
        replyToId: replyTarget?.id,
        attachmentIds: pendingAttachments.map((a) => a.id),
      }),
    });
    setMessages((prev) => upsertMessage(prev, dto)); // in case the WS event is delayed/missed
    setDraft("");
    setEmojiQuery(null);
    setReplyTarget(null);
    setPendingAttachments([]);
  }

  async function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const formData = new FormData();
    for (const f of files) formData.append("files", f);
    const result = await api<{ created: { id: number; filename: string }[] }>("/api/attachments", {
      method: "POST",
      body: formData,
    });
    setPendingAttachments((prev) => [...prev, ...result.created]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePendingAttachment(id: number) {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
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
    <div style={{ fontFamily }}>
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
        <button className="btn" onClick={popOutChat} title="Open in a floating window">
          Pop out
        </button>
        <ArchiveCalendar
          archiveDays={archiveDays}
          selectedDay={mode === "day" ? selectedDay : null}
          onSelect={(day) => {
            setSelectedDay(day);
            setMode("day");
          }}
        />
        {slug && (
          <SearchBox
            channelSlug={slug}
            onSearch={(query) => {
              setActiveSearch(query);
              setMode("search");
            }}
          />
        )}
      </div>

      <div className="message-list">
        {messages.length === 0 && <p style={{ color: "var(--text-dim)" }}>Nothing here yet.</p>}
        {mode === "search" ? (
          messages.map((m) => (
            <div key={m.id} style={{ cursor: "pointer" }} onClick={() => jumpToMessage(m)} title="Jump to this message">
              <StandardMessage message={m} onDelete={handleDelete} onQuote={handleQuote} onCopyLink={handleCopyLink} />
            </div>
          ))
        ) : displayMode === "standard" ? (
          messages.map((m) => <StandardMessage key={m.id} message={m} onDelete={handleDelete} onQuote={handleQuote} onCopyLink={handleCopyLink} />)
        ) : (
          groupMessages(messages).map((g) => (
            <MessageGroup key={g[0].id} group={g} onDelete={handleDelete} onQuote={handleQuote} onCopyLink={handleCopyLink} />
          ))
        )}
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
          {pendingAttachments.length > 0 && (
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              {pendingAttachments.map((a) => (
                <span key={a.id} className="btn" style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem" }}>
                  📎 {a.filename}{" "}
                  <button type="button" onClick={() => removePendingAttachment(a.id)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: "0.5rem", position: "relative" }}>
            {emojiQuery !== null && <EmojiPicker filter={emojiQuery} onSelect={insertEmoji} />}
            <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} style={{ display: "none" }} />
            <button type="button" className="btn" onClick={() => fileInputRef.current?.click()} title="Attach a file">
              📎
            </button>
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

      {pipWindow && slug && createPortal(<MiniChat slug={slug} channelName={channelName ?? slug} />, pipWindow.document.body)}
    </div>
  );
}
