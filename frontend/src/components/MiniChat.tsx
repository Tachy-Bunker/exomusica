import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { renderMessageContent } from "../lib/formatMessage";
import { useMentionResolutionStore } from "../lib/mentionResolutionStore";
import type { MessageDTO } from "../lib/types";
import { AttachmentPreview } from "./AttachmentPreview";

function upsertMessage(list: MessageDTO[], msg: MessageDTO): MessageDTO[] {
  const idx = list.findIndex((m) => m.id === msg.id);
  if (idx === -1) return [...list, msg].slice(-50);
  const copy = [...list];
  copy[idx] = msg;
  return copy;
}

const MAX_ATTACHMENTS_PER_MESSAGE = 10;

export function MiniChat({ slug, channelName }: { slug: string; channelName: string }) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<{ id: number; filename: string }[]>([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mentionCache = useMentionResolutionStore((s) => s.cache);
  const resolveMentions = useMentionResolutionStore((s) => s.resolve);

  useEffect(() => {
    const ids = messages.flatMap((m) => [...m.contentRaw.matchAll(/<@(\d+)>/g)].map((match) => match[1]));
    if (ids.length > 0) resolveMentions(ids);
  }, [messages, resolveMentions]);

  useEffect(() => {
    api<MessageDTO[]>(`/api/channels/${slug}/messages?limit=30`).then(setMessages);
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/${slug}`);
    ws.onmessage = (ev) => {
      const event = JSON.parse(ev.data);
      if (event.type === "message.create" || event.type === "message.update") {
        setMessages((prev) => upsertMessage(prev, event.message));
      }
    };
    return () => ws.close();
  }, [slug]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function uploadFiles(fileList: FileList | File[]) {
    const files = [...fileList];
    if (files.length === 0) return;
    const remaining = MAX_ATTACHMENTS_PER_MESSAGE - pendingAttachments.length;
    if (remaining <= 0) return;
    const selected = files.slice(0, remaining);
    const formData = new FormData();
    for (const f of selected) formData.append("files", f);
    const result = await api<{ created: { id: number; filename: string }[] }>("/api/attachments", { method: "POST", body: formData });
    setPendingAttachments((prev) => [...prev, ...result.created]);
  }

  async function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) await uploadFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    // Screenshot tools (Win+Shift+S, etc) put the image on the clipboard
    // as a file-like item, not literal text.
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      void uploadFiles(e.clipboardData.files);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDraggingFile(false);
    if (e.dataTransfer.files.length > 0) void uploadFiles(e.dataTransfer.files);
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() && pendingAttachments.length === 0) return;
    await api(`/api/channels/${slug}/messages`, {
      method: "POST",
      body: JSON.stringify({ contentRaw: draft, attachmentIds: pendingAttachments.map((a) => a.id) }),
    });
    setDraft("");
    setPendingAttachments([]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "var(--font-body)", color: "var(--text)", background: "var(--bg)" }}>
      <div style={{ padding: "0.5rem 0.7rem", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-display)", fontSize: "0.95rem" }}>
        {channelName}
      </div>
      <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "0.5rem 0.7rem" }}>
        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: "0.5rem", fontSize: "0.85rem" }}>
            <strong style={{ color: "var(--text-dim)" }}>{m.authorUsername}</strong>{" "}
            <span className="mono" style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
              {new Date(m.unixTimestamp * 1000).toLocaleTimeString()}
            </span>
            <div>{m.isDeleted ? <em style={{ color: "var(--text-dim)" }}>message deleted</em> : renderMessageContent(m.contentRaw, navigate, mentionCache)}</div>
            {m.attachments.map((a) => (
              <AttachmentPreview key={a.id} attachment={a} />
            ))}
          </div>
        ))}
      </div>
      <form
        onSubmit={handleSend}
        onDragOver={(e) => {
          e.preventDefault();
          if (e.dataTransfer.types.includes("Files")) setIsDraggingFile(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setIsDraggingFile(false);
        }}
        onDrop={handleDrop}
        style={{ display: "flex", flexDirection: "column", gap: "0.3rem", padding: "0.5rem", position: "relative", outline: isDraggingFile ? "2px dashed var(--accent-forum)" : "none", outlineOffset: "-2px" }}
      >
        {isDraggingFile && (
          <div style={{ position: "absolute", inset: 0, zIndex: 10, background: "var(--bg-elevated)", opacity: 0.92, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", color: "var(--text-dim)", pointerEvents: "none" }}>
            Drop files to attach
          </div>
        )}
        {pendingAttachments.length > 0 && (
          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
            {pendingAttachments.map((a) => (
              <span key={a.id} className="btn" style={{ fontSize: "0.7rem", padding: "0.1rem 0.3rem" }}>
                📎 {a.filename}{" "}
                <button type="button" onClick={() => setPendingAttachments((prev) => prev.filter((p) => p.id !== a.id))} style={{ background: "none", border: "none", cursor: "pointer" }}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} style={{ display: "none" }} />
          <button type="button" className="btn" onClick={() => fileInputRef.current?.click()} title="Attach a file">
            📎
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={handlePaste}
            style={{ flex: 1, background: "var(--bg-inset)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--text)", padding: "0.4rem" }}
            placeholder="Message…"
          />
          <button className="btn btn-primary" type="submit">
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
