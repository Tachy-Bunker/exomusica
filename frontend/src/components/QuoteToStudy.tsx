import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { loadStudies, useLoaded } from "../lib/hubs";
import { useMentionResolutionStore } from "../lib/mentionResolutionStore";
import { useRoomName } from "../lib/roomContext";
import { useToastStore } from "../lib/toastStore";
import type { MessageDTO } from "../lib/types";

/** In a message's menu: pin it (or the words selected inside it) to one of your studies as a signed quote. */
export function QuoteToStudy({ message, root, onDone }: { message: MessageDTO; root: HTMLElement | null; onDone: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { data: studies } = useLoaded(loadStudies);
  const room = useRoomName((s) => s.name);
  const mine = (studies ?? []).filter((s) => s.owner === user?.username && s.status === "IN_PROGRESS");
  const [selected, setSelected] = useState("");

  function toggle() {
    if (!open) {
      const sel = window.getSelection();
      const host = root?.closest(".msg-gest");
      const inside = sel && sel.rangeCount > 0 && !sel.isCollapsed && host && host.contains(sel.anchorNode) ? sel.toString().trim() : "";
      setSelected(inside);
    }
    setOpen((v) => !v);
  }
  async function pin(slug: string, title: string) {
    try {
      await api(`/api/studies/${slug}/quote`, { method: "POST", body: JSON.stringify({ text: (selected || message.contentRaw).replace(/<@(\d+)>/g, (m, id: string) => { const u = useMentionResolutionStore.getState().cache.get(id); return u ? `@${u.username}` : m; }), by: message.authorUsername, where: room || "chat", href: `${location.origin}${location.pathname}${location.search}#m-${message.id}` }) });
      useToastStore.getState().showToast(`Quoted in ${title}`);
      onDone();
    } catch (e) { useToastStore.getState().showToast(e instanceof ApiError ? e.message : "Couldn't quote it"); }
  }
  if (!user || message.kind && message.kind !== "text") return null;
  return (
    <div style={{ position: "relative" }}>
      <button className="btn" style={{ width: "100%", textAlign: "left" }} onClick={toggle} data-testid="quote-to-study">Quote in a study…</button>
      {open && (
        <div className="quote-studies" data-testid="quote-studies">
          <p className="home-dim" style={{ margin: "0.2rem 0.4rem", fontSize: "0.75rem" }}>{selected ? "The selected words" : "This message"}</p>
          {mine.length === 0 && <p className="home-dim" style={{ margin: "0.2rem 0.4rem" }}>No study in progress.</p>}
          {mine.slice(0, 8).map((s) => <button key={s.slug} className="btn" style={{ width: "100%", textAlign: "left" }} onClick={() => void pin(s.slug, s.title)} data-testid="quote-pick">{s.title}</button>)}
        </div>
      )}
    </div>
  );
}
