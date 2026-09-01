import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { renderMessageContent } from "../lib/formatMessage";
import type { MessageDTO } from "../lib/types";

function upsertMessage(list: MessageDTO[], msg: MessageDTO): MessageDTO[] {
  const idx = list.findIndex((m) => m.id === msg.id);
  if (idx === -1) return [...list, msg].slice(-50);
  const copy = [...list];
  copy[idx] = msg;
  return copy;
}

export function MiniChat({ slug, channelName }: { slug: string; channelName: string }) {
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

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

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    await api(`/api/channels/${slug}/messages`, { method: "POST", body: JSON.stringify({ contentRaw: draft }) });
    setDraft("");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "var(--font-body)", color: "var(--text)", background: "var(--bg)" }}>
      <div style={{ padding: "0.5rem 0.7rem", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-display)", fontSize: "0.95rem" }}>
        {channelName}
      </div>
      <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "0.5rem 0.7rem" }}>
        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: "0.5rem", fontSize: "0.85rem" }}>
            <strong>{m.authorUsername}</strong>{" "}
            <span className="mono" style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
              {new Date(m.unixTimestamp * 1000).toLocaleTimeString()}
            </span>
            <div>{m.isDeleted ? <em style={{ color: "var(--text-dim)" }}>message deleted</em> : renderMessageContent(m.contentRaw)}</div>
          </div>
        ))}
      </div>
      <form onSubmit={handleSend} style={{ display: "flex", gap: "0.4rem", padding: "0.5rem" }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ flex: 1, background: "var(--bg-inset)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--text)", padding: "0.4rem" }}
          placeholder="Message…"
        />
        <button className="btn btn-primary" type="submit">
          Send
        </button>
      </form>
    </div>
  );
}
