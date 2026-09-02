import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { AttachmentPreview } from "../components/AttachmentPreview";
import { renderMessageContent } from "../lib/formatMessage";

interface Conversation {
  partner: string;
  lastMessage: string;
  sentAt: number;
  unread: boolean;
}

interface ThreadMessage {
  id: number;
  fromMe: boolean;
  contentRaw: string;
  sentAt: number;
  attachments: { id: number; filename: string; url: string; sizeBytes: number }[];
}

export function PMsPage() {
  const { username } = useParams<{ username?: string }>();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<{ id: number; filename: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadConversations() {
    api<Conversation[]>("/api/pms").then(setConversations);
  }

  useEffect(loadConversations, []);

  useEffect(() => {
    if (!username) {
      setThread([]);
      return;
    }
    api<ThreadMessage[]>(`/api/pms/${username}`).then(setThread);
  }, [username]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if ((!draft.trim() && pendingAttachments.length === 0) || !username) return;
    await api(`/api/pms/${username}`, {
      method: "POST",
      body: JSON.stringify({ contentRaw: draft, attachmentIds: pendingAttachments.map((a) => a.id) }),
    });
    setDraft("");
    setPendingAttachments([]);
    api<ThreadMessage[]>(`/api/pms/${username}`).then(setThread);
    loadConversations();
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

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "2rem" }}>
      <nav>
        <h3 style={{ fontSize: "0.9rem" }}>Conversations</h3>
        {conversations.length === 0 && <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Nothing yet.</p>}
        <ul style={{ listStyle: "none", padding: 0 }}>
          {conversations.map((c) => (
            <li key={c.partner} style={{ marginBottom: "0.4rem" }}>
              <Link to={`/pms/${c.partner}`} style={{ fontWeight: c.unread ? 700 : 400 }}>
                {c.partner}
              </Link>
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.lastMessage}
              </div>
            </li>
          ))}
        </ul>
      </nav>

      <div>
        {!username && <p style={{ color: "var(--text-dim)" }}>Pick a conversation, or visit someone's profile to start one.</p>}
        {username && (
          <>
            <h2 style={{ fontSize: "1.1rem" }}>{username}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
              {thread.map((m) => (
                <div
                  key={m.id}
                  style={{
                    alignSelf: m.fromMe ? "flex-end" : "flex-start",
                    background: m.fromMe ? "var(--accent-forum-dim)" : "var(--bg-elevated)",
                    borderRadius: "var(--radius)",
                    padding: "0.4rem 0.7rem",
                    maxWidth: "70%",
                  }}
                >
                  {renderMessageContent(m.contentRaw, navigate)}
                  {m.attachments.map((a) => (
                    <AttachmentPreview key={a.id} attachment={a} />
                  ))}
                </div>
              ))}
            </div>
            {pendingAttachments.length > 0 && (
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
                {pendingAttachments.map((a) => (
                  <span key={a.id} className="btn" style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem" }}>
                    📎 {a.filename}{" "}
                    <button
                      type="button"
                      onClick={() => setPendingAttachments((prev) => prev.filter((p) => p.id !== a.id))}
                      style={{ background: "none", border: "none", cursor: "pointer" }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <form onSubmit={handleSend} style={{ display: "flex", gap: "0.5rem" }}>
              <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} style={{ display: "none" }} />
              <button type="button" className="btn" onClick={() => fileInputRef.current?.click()} title="Attach a file">
                📎
              </button>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} style={{ flex: 1 }} placeholder="Message…" />
              <button className="btn btn-primary" type="submit">
                Send
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
