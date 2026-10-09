import { useEffect, useRef } from "react";
import { gradientTable } from "../lib/studioDsp";
import { intensity, paintRows, scrollTopFor, STRIP_ROWS, type Span } from "../lib/chatStrip";
import type { MessageDTO } from "../lib/types";

const W = 10, LANE = 3;
let table: Uint8Array | null = null;

/**
 * The conversation as a spectrogram: a slim strip beside the message list. Each message is painted where it sits in the list (louder = brighter along the site gradient;
 * the left lane is orange for your messages). The lit window shows what you are looking at; click or drag to travel. Painted once per change, never per scroll.
 */
export function ChatStrip({ listRef, messages, meId, unreadFromId }: { listRef: React.RefObject<HTMLDivElement | null>; messages: MessageDTO[]; meId: number | null; unreadFromId: number | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const lastKey = `${messages.length}:${messages[messages.length - 1]?.id ?? 0}`;

  useEffect(() => {
    const list = listRef.current, cv = canvas.current;
    if (!list || !cv) return;
    let raf = 0;
    const place = () => {
      const total = list.scrollHeight || 1;
      if (view.current) { view.current.style.top = `${(list.scrollTop / total) * 100}%`; view.current.style.height = `${Math.min(100, (list.clientHeight / total) * 100)}%`; }
    };
    const paint = () => {
      raf = 0;
      const total = list.scrollHeight, lt = list.getBoundingClientRect().top, st = list.scrollTop;
      const spans: Span[] = [];
      let markTop: number | null = null;
      for (const m of messages) {
        const el = document.getElementById(`m-${m.id}`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const top = r.top - lt + st;
        spans.push({ top, height: r.height, value: intensity(m), mine: m.authorId === meId });
        if (m.id === unreadFromId) markTop = top;
      }
      const { value, mine } = paintRows(spans, total);
      table ??= gradientTable();
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      const img = ctx.createImageData(W, STRIP_ROWS), d = img.data;
      for (let y = 0; y < STRIP_ROWS; y++) for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        if (x < LANE) { const on = value[y] > 0; d[o] = mine[y] ? 226 : 70; d[o + 1] = mine[y] ? 112 : 84; d[o + 2] = mine[y] ? 63 : 110; d[o + 3] = on ? (mine[y] ? 255 : 150) : 25; }
        else { const v = value[y] * 3; d[o] = table[v]; d[o + 1] = table[v + 1]; d[o + 2] = table[v + 2]; d[o + 3] = 255; }
      }
      ctx.putImageData(img, 0, 0);
      if (mark.current) { mark.current.style.display = markTop === null ? "none" : "block"; if (markTop !== null) mark.current.style.top = `${(markTop / total) * 100}%`; }
      place();
    };
    const later = () => { if (!raf) raf = requestAnimationFrame(paint); };
    later();
    const onScroll = () => place();
    list.addEventListener("scroll", onScroll, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(later) : null;
    ro?.observe(list);
    return () => { if (raf) cancelAnimationFrame(raf); list.removeEventListener("scroll", onScroll); ro?.disconnect(); };
  }, [listRef, lastKey, meId, unreadFromId]); // eslint-disable-line react-hooks/exhaustive-deps

  function travel(e: React.PointerEvent) {
    const list = listRef.current, box = wrap.current;
    if (!list || !box) return;
    const r = box.getBoundingClientRect();
    list.scrollTop = scrollTopFor((e.clientY - r.top) / r.height, list.scrollHeight, list.clientHeight);
  }
  return (
    <div className="chat-strip" ref={wrap} data-testid="chat-strip" role="scrollbar" aria-orientation="vertical" aria-controls="chat-list" aria-label="Conversation overview: click to jump"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); travel(e); }}
      onPointerMove={(e) => { if (e.buttons) travel(e); }}>
      <canvas ref={canvas} width={W} height={STRIP_ROWS} aria-hidden="true" />
      <div className="chat-strip-view" ref={view} aria-hidden="true" />
      <div className="chat-strip-unread" ref={mark} aria-hidden="true" style={{ display: "none" }} data-testid="strip-unread" />
    </div>
  );
}
