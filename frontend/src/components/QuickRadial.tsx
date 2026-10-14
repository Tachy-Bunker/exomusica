import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import type { MessageDTO } from "../lib/types";
import { useEmojiStore } from "../lib/emojiStore";
import { useToastStore } from "../lib/toastStore";
import { actionForCode, bump, loadCounts, orderByUse, quoteText, saveCounts, type QuickId } from "../lib/quickActions";
import { RadialMenu, type RadialItem } from "./RadialMenu";

const typing = (t: EventTarget | null) => { const e = t as HTMLElement | null; return !!e && (e.tagName === "INPUT" || e.tagName === "TEXTAREA" || e.tagName === "SELECT" || e.isContentEditable); };

/** Keyboard quick actions: rest the pointer on a message (or Tab to it) and press A. A fan of four opens: Reply, React, Quote, Pin. Each has a fixed letter (R, E, Q, P) that works while the fan is open; the fan's order follows what you use most. */
export function QuickRadial({ messages, canAct, onReply, onQuote }: { messages: () => MessageDTO[]; canAct: boolean; onReply: (m: MessageDTO) => void; onQuote: (text: string) => void }) {
  const [open, setOpen] = useState<{ id: number; x: number; y: number; react: boolean } | null>(null);
  const [counts, setCounts] = useState(loadCounts);
  const emojis = useEmojiStore((s) => s.emojis);
  const pointer = useRef({ x: 0, y: 0 });
  const openRef = useRef(open); openRef.current = open;

  useEffect(() => {
    if (!canAct) return;
    const move = (e: PointerEvent) => { pointer.current.x = e.clientX; pointer.current.y = e.clientY; };
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat) return;
      if (!openRef.current && typing(e.target)) return;
      if (!openRef.current) {
        if (e.code !== "KeyA") return;
        const hit = document.elementFromPoint(pointer.current.x, pointer.current.y)?.closest('[id^="m-"]') ?? (document.activeElement as HTMLElement | null)?.closest?.('[id^="m-"]') ?? null;
        const id = hit ? Number(hit.id.slice(2)) : NaN;
        if (!Number.isFinite(id) || !messages().some((m) => m.id === id && !m.isDeleted)) return;
        const r = (hit as HTMLElement).getBoundingClientRect();
        const inside = pointer.current.x >= r.left && pointer.current.x <= r.right && pointer.current.y >= r.top && pointer.current.y <= r.bottom;
        e.preventDefault();
        setOpen({ id, x: inside ? pointer.current.x : r.left + 40, y: inside ? pointer.current.y : r.top + r.height / 2, react: false });
        return;
      }
      // the fan is open: its keys win over everything else (P would otherwise shuffle the player)
      const o = openRef.current;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.code === "Escape") { setOpen(null); return; }
      if (o.react) { const n = /^Digit([1-6])$/.exec(e.code); if (n) react(o.id, Number(n[1]) - 1); return; }
      const a = actionForCode(e.code) ?? (/^Digit([1-4])$/.test(e.code) ? orderByUse(counts)[Number(e.code.slice(5)) - 1] : undefined);
      if (a) choose(a.id);
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointermove", move); document.removeEventListener("keydown", key, true); };
  }); // re-bound each render so the handlers see the current counts and fan

  const toast = (t: string) => useToastStore.getState().showToast(t);
  const use = (id: QuickId) => setCounts((c) => { const n = bump(c, id); saveCounts(n); return n; });
  const react = (msgId: number, i: number) => {
    const e = emojis[i]; if (!e) return;
    setOpen(null); use("react");
    void api(`/api/messages/${msgId}/reactions`, { method: "POST", body: JSON.stringify({ emojiId: e.id }) }).catch(() => toast("Could not react"));
  };
  const choose = (id: QuickId) => {
    const o = openRef.current; if (!o) return;
    const m = messages().find((x) => x.id === o.id); if (!m) { setOpen(null); return; }
    if (id === "react") { if (!emojis.length) { toast("No emoji to react with"); setOpen(null); return; } setOpen({ ...o, react: true }); return; }
    setOpen(null); use(id);
    if (id === "reply") onReply(m);
    else if (id === "quote") onQuote(quoteText(m.authorUsername, m.contentRaw));
    else void api(`/api/messages/${m.id}/bookmark`, { method: "POST", body: JSON.stringify({}) }).then(() => toast("Pinned to your bookmarks")).catch(() => toast("Could not pin"));
  };

  const items = useMemo<RadialItem[]>(() => {
    if (open?.react) return emojis.slice(0, 6).map((e, i) => ({ id: `e${i}`, label: e.name, glyph: <img src={e.imageUrl} alt="" width={24} height={24} />, hint: String(i + 1) }));
    return orderByUse(counts).map((a) => ({ id: a.id, label: a.label, glyph: a.glyph, hint: a.key }));
  }, [open?.react, emojis, counts]);
  const pick = useCallback((it: RadialItem) => { if (it.id.startsWith("e") && open?.react) react(open.id, Number(it.id.slice(1))); else choose(it.id as QuickId); }, [open, emojis, counts]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  return <RadialMenu x={open.x} y={open.y} items={items} sel={-1} onPick={pick} onClose={() => setOpen(null)} />;
}
