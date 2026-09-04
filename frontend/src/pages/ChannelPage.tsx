import { useEffect, useRef, useState, useCallback, useContext, createContext, type ChangeEvent, type ClipboardEvent, type FormEvent } from "react";
import { Link, useParams, useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { exportChatHistory } from "../lib/exportChat";
import { ExportIcon } from "../components/Icons";
import { useAuth } from "../lib/auth";
import { useAudioStore } from "../lib/audioStore";
import { renderMessageContent } from "../lib/formatMessage";
import { useMentionResolutionStore } from "../lib/mentionResolutionStore";
import { EmojiPicker } from "../components/EmojiPicker";
import { MentionPicker } from "../components/MentionPicker";
import { AttachmentPreview } from "../components/AttachmentPreview";
import { SearchBox } from "../components/SearchBox";
import { TopicSwitcher } from "../components/TopicSwitcher";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useEmojiStore, type Emoji } from "../lib/emojiStore";
import type { MessageDTO } from "../lib/types";
import { createPortal } from "react-dom";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { isTypingTarget } from "../lib/isTypingTarget";
import { usePresenceStore } from "../lib/presenceStore";
import { useCustomFont, type FontInfo } from "../lib/useCustomFont";
import { MiniChat } from "../components/MiniChat";
import { useSiteEffectsStore } from "../lib/siteEffectsStore";
import { getCurrentSfxVolume } from "../lib/volumeMixerStore";
import { playOneShotSfx } from "../lib/oneShotSfx";
import { useChatHudReveal } from "../lib/useChatHudReveal";
import { useFixedPortalRoot } from "../lib/useFixedPortalRoot";

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

const LinkClickContext = createContext<((url: string) => void) | undefined>(undefined);

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
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setReacting(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  async function addReaction(emoji: Emoji) {
    setReacting(false);
    setOpen(false);
    await api(`/api/messages/${message.id}/reactions`, { method: "POST", body: JSON.stringify({ emojiId: emoji.id }) });
    // No local optimistic update needed — the live channel is subscribed to
    // message.update events, which this reaction triggers server-side.
  }

  return (
    <div className="message-menu" ref={menuRef} onClick={(e) => e.stopPropagation()}>
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
  const mentionCache = useMentionResolutionStore((s) => s.cache);
  const resolveMentions = useMentionResolutionStore((s) => s.resolve);

  useEffect(() => {
    const ids = [...message.contentRaw.matchAll(/<@(\d+)>/g)].map((m) => m[1]);
    if (ids.length > 0) resolveMentions(ids);
  }, [message.contentRaw, resolveMentions]);

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
      <div style={{ paddingRight: "1.6rem" }}>{renderMessageContent(message.contentRaw, useContext(LinkClickContext), mentionCache)}</div>
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

export function ChannelPage({ channelSlug, fillHeight }: { channelSlug?: string; fillHeight?: boolean } = {}) {
  const params = useParams<{ slug: string }>();
  const slug = channelSlug ?? params.slug;

  useEffect(() => {
    if (!slug) return;
    const url = useSiteEffectsStore.getState().chatOpenSfxUrl;
    if (!url) return;
    playOneShotSfx(url, getCurrentSfxVolume());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  const { user } = useAuth();
  const isDesktop = useIsDesktop();
  // Mobile standalone view behaves like fillHeight mode too — internally
  // scrolling message list, composer always pinned and visible — the dock
  // never renders on mobile, so isDesktop alone correctly identifies this.
  const effectiveFillHeight = fillHeight || !isDesktop;
  const [isChatFullscreen, setIsChatFullscreen] = useState(false);
  const hudReveal = useChatHudReveal(slug ? `${slug}-${isChatFullscreen}` : undefined);
  const mobileWindowRef = useRef<HTMLDivElement>(null);

  function toggleChatFullscreen() {
    setIsChatFullscreen((v) => !v);
  }
  const [mode, setMode] = useState<ViewMode>("live");
  const [displayMode, setDisplayMode] = useState<DisplayMode>(
    () => (localStorage.getItem("exomusica_display_mode") as DisplayMode) ?? "standard",
  );
  const [messageFontSize, setMessageFontSize] = useState<number>(
    () => Number(localStorage.getItem("exomusica_message_font_size")) || 100,
  );
  function adjustFontSize(delta: number) {
    setMessageFontSize((prev) => {
      const next = Math.min(160, Math.max(70, prev + delta));
      localStorage.setItem("exomusica_message_font_size", String(next));
      return next;
    });
  }
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [activeSearch, setActiveSearch] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const messageListRef = useRef<HTMLDivElement>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [showLiveChatButton, setShowLiveChatButton] = useState(false);
  const [archiveDays, setArchiveDays] = useState<{ day: string; messageCount: number }[]>([]);
  const [draft, setDraft] = useState("");
  const [emojiQuery, setEmojiQuery] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [channelName, setChannelName] = useState<string | null>(null);
  const [channelFont, setChannelFont] = useState<FontInfo | null>(null);
  const fontFamily = useCustomFont(channelFont);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<{ id: number; filename: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [pendingScrollTo, setPendingScrollTo] = useState<number | null>(null);

  const [exportAttachments, setExportAttachments] = useState<{ filename: string; url: string }[] | null>(null);

  async function exportChat() {
    if (!slug) return;
    await exportChatHistory(slug);
    const attachments = await api<{ filename: string; url: string }[]>(`/api/channels/${slug}/export/attachments`);
    setExportAttachments(attachments);
  }

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
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mobile virtual keyboard handling: visualViewport shrinks when the
  // keyboard opens (a real, standard signal — no guessing based on focus
  // timing). Scroll the composer into view on open; restore the scroll
  // position that was current right before the keyboard opened, rather
  // than an arbitrary "scroll to top", since the user may have been
  // reading further down when they tapped in.
  useEffect(() => {
    if (isDesktop || !window.visualViewport) return;
    const vv = window.visualViewport;
    let keyboardOpen = false;
    let scrollBeforeKeyboard = 0;

    let composerTriggeredOpen = false;

    function handleViewportResize() {
      const shrunk = window.innerHeight - vv!.height > 120; // heuristic: keyboard, not just a minor UI chrome change
      const composerFocused = document.activeElement === textareaRef.current;
      if (shrunk && !keyboardOpen) {
        keyboardOpen = true;
        composerTriggeredOpen = composerFocused;
        if (!composerFocused) return; // some other input (Location, search) opened the keyboard — leave the view alone
        scrollBeforeKeyboard = messageListRef.current?.scrollTop ?? window.scrollY;
        requestAnimationFrame(() => {
          textareaRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
        });
      } else if (!shrunk && keyboardOpen) {
        keyboardOpen = false;
        if (!composerTriggeredOpen) return;
        requestAnimationFrame(() => {
          if (messageListRef.current) messageListRef.current.scrollTop = scrollBeforeKeyboard;
          else window.scrollTo({ top: scrollBeforeKeyboard });
        });
      }
    }

    vv.addEventListener("resize", handleViewportResize);
    return () => vv.removeEventListener("resize", handleViewportResize);
  }, [isDesktop]);

  useEffect(() => {
    if (!user) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter" || isTypingTarget(e.target)) return;
      e.preventDefault();
      textareaRef.current?.focus();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [user]);

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
    if (mode === "live") params.set("limit", "100");
    setHasMoreOlder(true);
    api<MessageDTO[]>(`/api/channels/${slug}/messages?${params}`).then((data) => {
      setMessages(data);
      if (mode === "live" && data.length < 100) setHasMoreOlder(false);
      if (mode === "live" && data.length > 0) {
        const last = data[data.length - 1];
        // Wait a tick for the DOM to actually contain the new messages before scrolling to one.
        requestAnimationFrame(() => {
          document.getElementById(`m-${last.id}`)?.scrollIntoView({ block: "end" });
        });
      }
    });
  }, [slug, mode, selectedDay, activeSearch]);

  // Discord-style infinite scroll: scrolling near the top of the live feed
  // loads the next 100 older messages via cursor pagination, prepending
  // them without visually jerking the viewport — we measure the height
  // added and adjust scrollTop by that same amount in the same paint.
  const loadOlderMessages = useCallback(() => {
    if (!slug || mode !== "live" || loadingOlder || !hasMoreOlder || messages.length === 0) return;
    const oldest = messages[0];
    const container = messageListRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    setLoadingOlder(true);
    api<MessageDTO[]>(`/api/channels/${slug}/messages?limit=100&before=${oldest.id}`)
      .then((older) => {
        if (older.length < 100) setHasMoreOlder(false);
        if (older.length === 0) return;
        setMessages((prev) => [...older, ...prev]);
        requestAnimationFrame(() => {
          if (container) {
            const heightAdded = container.scrollHeight - prevScrollHeight;
            container.scrollTop += heightAdded;
          }
        });
      })
      .finally(() => setLoadingOlder(false));
  }, [slug, mode, loadingOlder, hasMoreOlder, messages]);

  useEffect(() => {
    const container = messageListRef.current;
    if (!container) return;
    function handleScroll() {
      if (container!.scrollTop < 200) loadOlderMessages();
      const distanceFromBottom = container!.scrollHeight - container!.scrollTop - container!.clientHeight;
      // ~60px average message height — an approximation, since actual
      // height varies with content/attachments, but "roughly 30 messages"
      // doesn't need to be exact to be useful here.
      setShowLiveChatButton(distanceFromBottom > 30 * 60);
    }
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [loadOlderMessages]);

  useEffect(() => {
    if (mode === "search") setShowLiveChatButton(true);
  }, [mode]);

  function scrollToLive() {
    if (mode === "search") {
      setMode("live");
      setActiveSearch(null);
    }
    const container = messageListRef.current;
    requestAnimationFrame(() => {
      if (container) container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    });
    setShowLiveChatButton(false);
  }


  const reportViewing = usePresenceStore((s) => s.reportViewing);
  useEffect(() => {
    if (!slug) return;
    reportViewing(mode === "live" ? slug : null);
    return () => reportViewing(null);
  }, [slug, mode, reportViewing]);

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
        if (event.type === "message.create" && mode === "live") {
          requestAnimationFrame(() => {
            document.getElementById(`m-${event.message.id}`)?.scrollIntoView({ block: "end" });
          });
        }
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
    setFollowing(true); // posting auto-follows server-side; keep the button in sync without a refetch
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
    const emojiMatch = value.slice(0, cursor).match(/:([a-z0-9_]*)$/i);
    setEmojiQuery(emojiMatch ? emojiMatch[1] : null);
    const mentionMatch = value.slice(0, cursor).match(/(?:^|\s)@([a-zA-Z0-9_.-]*)$/);
    setMentionQuery(mentionMatch ? mentionMatch[1] : null);
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

  function insertMention(username: string) {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? draft.length;
    const match = draft.slice(0, cursor).match(/(?:^|\s)@([a-zA-Z0-9_.-]*)$/);
    if (!match) return;
    const start = cursor - match[0].length + (match[0][0] === " " ? 1 : 0);
    const next = `${draft.slice(0, start)}@${username} ${draft.slice(cursor)}`;
    setDraft(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      const newCursor = start + username.length + 2;
      el.setSelectionRange(newCursor, newCursor);
    });
  }

  const isMobileWindow = !isDesktop && !fillHeight;
  const portalRoot = useFixedPortalRoot();

  const content = (
    <LinkClickContext.Provider value={navigate}>
    <div
      ref={isMobileWindow ? mobileWindowRef : undefined}
      style={
        effectiveFillHeight
          ? {
              fontFamily,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              ...(isMobileWindow
                ? isChatFullscreen
                  ? { position: "fixed" as const, inset: 0, zIndex: 55, background: "var(--bg)" }
                  : { height: "calc(100dvh - var(--nav-height, 3.6rem) - 3rem - var(--player-height, 0px))", background: "var(--bg)" }
                : { height: "100%" }),
            }
          : { fontFamily }
      }
    >
      <div className="channel-toolbar" style={{ display: "flex", gap: "0.6rem", marginBottom: effectiveFillHeight ? "0.6rem" : "1rem", flexWrap: "wrap", flexShrink: 0, alignItems: "center" }}>
        {isMobileWindow && (
          <button className="btn" onClick={toggleChatFullscreen} title={isChatFullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {isChatFullscreen ? "⤡" : "⤢"}
          </button>
        )}
        {(!isMobileWindow || isChatFullscreen) && (
          <>
            <TopicSwitcher />
            {isDesktop && (
              <button className="btn" onClick={popOutChat} title="Open in a floating window">
                ↗ Pop out
              </button>
            )}
            <button className="export-icon-btn" onClick={exportChat} title="Download the full chat history as a text file">
              <ExportIcon size={20} />
            </button>
            {slug && (
              <SearchBox
                channelSlug={slug}
                onSearch={(query) => {
                  setActiveSearch(query);
                  setMode("search");
                }}
              />
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "0.2rem" }} title="Message text size">
              <button className="btn" style={{ padding: "0.1rem 0.5rem" }} onClick={() => adjustFontSize(-10)}>
                −
              </button>
              <button className="btn" style={{ padding: "0.1rem 0.5rem" }} onClick={() => adjustFontSize(10)}>
                +
              </button>
            </div>
            {user && (
              <button className="btn" onClick={toggleFollow}>
                {following ? "Following ✓" : "Follow"}
              </button>
            )}
            <button className="btn" onClick={toggleDisplayMode} title={displayMode === "grouped" ? "Switch to standard view" : "Switch to grouped view"}>
              👁
            </button>
          </>
        )}
      </div>

      {exportAttachments && (
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.6rem", marginBottom: "0.6rem", maxHeight: 200, overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
            <strong style={{ fontSize: "0.85rem" }}>Attachments ({exportAttachments.length}) — download individually</strong>
            <button className="btn" style={{ padding: "0 0.4rem" }} onClick={() => setExportAttachments(null)}>
              ×
            </button>
          </div>
          {exportAttachments.length === 0 && <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>No attachments in this chat.</p>}
          {exportAttachments.map((a, i) => (
            <div key={i} style={{ fontSize: "0.8rem" }}>
              <a href={a.url} download={a.filename} target="_blank" rel="noreferrer">
                {a.filename}
              </a>
            </div>
          ))}
        </div>
      )}


      <div
        ref={messageListRef}
        className="message-list"
        style={{
          fontSize: `${messageFontSize}%`,
          ...(effectiveFillHeight ? { flex: 1, minHeight: 0, overflowY: "auto" as const, maxWidth: "none" } : {}),
        }}
      >
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

      {showLiveChatButton && (
        <button
          className="btn"
          onClick={scrollToLive}
          style={{ width: "100%", textAlign: "center", fontSize: `${messageFontSize}%`, marginBottom: "0.4rem" }}
        >
          ⇣⇣ Live chat ⇣⇣
        </button>
      )}

      {!user && mode === "live" && (
        <div style={{ marginTop: effectiveFillHeight ? 0 : "1rem", paddingTop: effectiveFillHeight ? "1rem" : 0, borderTop: effectiveFillHeight ? "1px solid var(--border)" : "none", flexShrink: 0, textAlign: "center" }}>
          <Link to="/join" className="btn btn-primary join-to-chat-reveal" style={{ display: "inline-flex" }}>
            {"Join to chat".split("").map((ch, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.045}s` }}>
                {ch === " " ? "\u00A0" : ch}
              </span>
            ))}
          </Link>
        </div>
      )}
      {user && mode === "live" && (
        <form
          onSubmit={handleSend}
          style={{
            marginTop: effectiveFillHeight ? 0 : "1rem",
            paddingTop: effectiveFillHeight ? "1rem" : 0,
            borderTop: effectiveFillHeight ? "1px solid var(--border)" : "none",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
            maxWidth: effectiveFillHeight ? undefined : 720,
            position: "relative",
          }}
        >
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
            {mentionQuery !== null && <MentionPicker filter={mentionQuery} onSelect={insertMention} />}
            <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} style={{ display: "none" }} />
            <button type="button" className="btn" onClick={() => fileInputRef.current?.click()} title="Attach a file">
              📎
            </button>
            <div style={{ position: "relative", flex: 1 }}>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={handleDraftChange}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                  // Shift+Enter or Ctrl/Cmd+Enter: fall through to the
                  // textarea's own default behavior, which inserts a newline.
                }}
                rows={2}
                style={{ width: "100%", fontSize: `${messageFontSize}%` }}
                className="hud-reveal-textarea"
                placeholder={hudReveal.placeholderText}
              />
              {draft.length === 0 && (
                <div
                  className="mono"
                  style={{
                    position: "absolute",
                    left: "0.7rem",
                    top: "0.5rem",
                    color: "var(--text-dim)",
                    fontSize: `${messageFontSize}%`,
                    pointerEvents: "none",
                  }}
                >
                  {hudReveal.revealedPlaceholder}
                  {hudReveal.isRevealing && hudReveal.revealedSend.length === 0 && <span className="space-hud-cursor">▌</span>}
                </div>
              )}
            </div>
            <button className="btn btn-primary" type="submit" style={{ fontSize: `${messageFontSize}%` }}>
              {hudReveal.isRevealing ? (
                <>
                  {hudReveal.revealedSend}
                  <span className="space-hud-cursor">▌</span>
                </>
              ) : (
                "Send"
              )}
            </button>
          </div>
        </form>
      )}

      {pipWindow && slug && createPortal(<MiniChat slug={slug} channelName={channelName ?? slug} />, pipWindow.document.body)}
    </div>
    </LinkClickContext.Provider>
  );

  // Same fix as the player bar: only actually portal while genuinely in
  // fullscreen mode (position:fixed, needs the true viewport) — normal
  // in-place rendering the rest of the time, so this doesn't change
  // anything about how the dock or standalone page rendering works.
  if (isChatFullscreen && isMobileWindow && portalRoot) return createPortal(content, portalRoot);
  return content;
}
