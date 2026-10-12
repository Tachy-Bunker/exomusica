import { useEffect, useRef, useState } from "react";
import { snapDetent, stepDetent, sheetSizes, type Detent } from "../lib/gesture";
import { buzz, canBuzz, hapticsOn, setHaptics } from "../lib/haptics";

const KEY = "exomusica_sheet";
const read = (): Detent => { try { const v = sessionStorage.getItem(KEY); return v === "half" || v === "full" ? v : "peek"; } catch { return "peek"; } };

/** The chat on a phone as a sheet over the page: peek (just the composer and the last line), half, or full. Drag the handle, or tap it to step up. */
export function ChatSheet({ title, children }: { title: string; children: React.ReactNode }) {
  const [detent, setDetent] = useState<Detent>(read);
  const [drag, setDrag] = useState<number | null>(null); // height while a finger is on the handle
  const [vh, setVh] = useState(() => window.innerHeight);
  const [hap, setHap] = useState(hapticsOn);
  const g = useRef({ y0: 0, h0: 0, last: 0, t: 0, v: 0, moved: false });
  useEffect(() => { const f = () => setVh(window.innerHeight); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  const sizes = sheetSizes(vh);
  const put = (d: Detent) => { setDetent(d); try { sessionStorage.setItem(KEY, d); } catch { /* storage blocked */ } };
  const height = drag ?? sizes[detent];
  return (
    <section className="chat-sheet" data-detent={drag !== null ? "drag" : detent} style={{ height, ["--sheet-peek" as string]: `${sizes.peek}px` }} aria-label={title} data-testid="chat-sheet">
      <div className="chat-sheet-grab" role="button" tabIndex={0} aria-label={`Chat, ${detent}. Drag or tap to resize`} data-testid="sheet-handle"
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " " || e.key === "ArrowUp") { e.preventDefault(); put(stepDetent(detent, 1)); } else if (e.key === "ArrowDown") { e.preventDefault(); put(stepDetent(detent, -1)); } }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); g.current = { y0: e.clientY, h0: sizes[detent], last: e.clientY, t: e.timeStamp, v: 0, moved: false }; }}
        onPointerMove={(e) => {
          if (!e.buttons && e.pointerType === "mouse") return;
          const s = g.current, dy = s.y0 - e.clientY;
          if (!s.moved && Math.abs(dy) < 6) return;
          s.moved = true; const dt = Math.max(1, e.timeStamp - s.t); s.v = (s.last - e.clientY) / dt; s.last = e.clientY; s.t = e.timeStamp;
          setDrag(Math.max(sizes.peek, Math.min(sizes.full, s.h0 + dy)));
        }}
        onPointerUp={(e) => {
          const s = g.current;
          if (!s.moved) put(detent === "full" ? "peek" : stepDetent(detent, 1)); // a tap steps up; from full it folds back down
          else { const d = snapDetent(drag ?? sizes[detent], s.v, sizes); put(d); buzz("snap"); }
          setDrag(null); e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => setDrag(null)}>
        <i className="chat-sheet-bar" aria-hidden="true" />
        <b className="chat-sheet-title">{title}</b>
        {canBuzz() && <button type="button" className="chat-sheet-hap" aria-pressed={hap} aria-label="Buzz on send and on gestures" title="Buzz" onPointerDown={(e) => e.stopPropagation()} onClick={() => { setHaptics(!hap); setHap(!hap); if (!hap) buzz("tick"); }} data-testid="sheet-haptics">{hap ? "📳" : "🔕"}</button>}
      </div>
      <div className="chat-sheet-body">{children}</div>
    </section>
  );
}
