import { useRef, useState, type CSSProperties } from "react";
import { clampWidth, type ImageAlign, type ImageAttrs } from "../lib/images";

interface Props {
  src: string;
  alt: string;
  attrs: ImageAttrs;
  /** In the writing preview: shows a drag handle and size/alignment buttons. Readers just see the picture. */
  editable: boolean;
  onChange?: (attrs: ImageAttrs) => void;
}

const GLYPH: Record<ImageAlign, string> = { left: "⇤", center: "↔", right: "⇥" };

const contentWidth = (el: HTMLElement) => {
  const cs = getComputedStyle(el);
  return el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
};

/** A picture in a study: sized and aligned as written, and (while writing) resizable by dragging its corner. */
export function StudyImage({ src, alt, attrs, editable, onChange }: Props) {
  const figRef = useRef<HTMLElement>(null);
  const [live, setLive] = useState<number | null>(null); // the width in pixels while the handle is being dragged
  const [broken, setBroken] = useState(false);
  const align = attrs.align ?? "left";
  // The newest attributes, updated the instant a change is made: a second key press or click can arrive before React has redrawn,
  // and must step from the latest value, not from what was last drawn.
  // (The preview is drawn from a slightly delayed copy of the text, so right after a change React may draw once more with the OLD
  // values: those must not overwrite the newer ones. Only a genuinely different incoming value replaces them.)
  const latest = useRef(attrs);
  const seen = useRef(JSON.stringify(attrs));
  const incoming = JSON.stringify(attrs);
  if (incoming !== seen.current) {
    seen.current = incoming;
    latest.current = attrs;
  }
  const emit = (next: ImageAttrs) => {
    latest.current = next;
    onChange?.(next);
  };

  const style: CSSProperties = {
    width: live !== null ? live : attrs.width ? `${attrs.width.value}${attrs.width.unit}` : undefined,
    marginLeft: align === "left" ? 0 : "auto",
    marginRight: align === "right" ? 0 : "auto",
  };
  if (align === "left") style.marginRight = "auto";

  function startResize(e: React.PointerEvent<HTMLElement>) {
    const fig = figRef.current;
    const parent = fig?.parentElement;
    if (!fig || !parent || !onChange) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = fig.getBoundingClientRect().width;
    const container = Math.max(1, contentWidth(parent));
    let width = startWidth;
    const move = (ev: PointerEvent) => {
      width = Math.max(24, Math.min(container, startWidth + (ev.clientX - startX)));
      setLive(width);
    };
    const finish = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      setLive(null);
      // stored as a percentage of the page column, so it adapts to every screen
      emit({ ...latest.current, width: clampWidth({ value: (width / container) * 100, unit: "%" }) });
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }

  function nudge(e: React.KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const fig = figRef.current;
    const parent = fig?.parentElement;
    if (!fig || !parent || !onChange) return;
    const cur = latest.current;
    const now = cur.width?.unit === "%" ? cur.width.value : (fig.getBoundingClientRect().width / Math.max(1, contentWidth(parent))) * 100;
    const step = e.shiftKey ? 1 : 5;
    emit({ ...cur, width: clampWidth({ value: now + (e.key === "ArrowRight" ? step : -step), unit: "%" }) });
  }

  if (broken) {
    return (
      <figure className="study-img study-img-broken" data-nocite="" style={style}>
        <span>This image can't be loaded{alt ? `: ${alt}` : ""}</span>
      </figure>
    );
  }

  const img = <img src={src} alt={alt} loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)} />;
  return (
    <figure ref={figRef} className={`study-img${editable ? " study-img-editable" : ""}`} data-nocite="" style={style} tabIndex={editable ? 0 : undefined}>
      {editable ? img : <a href={src} target="_blank" rel="noreferrer" title="Open the full-size image">{img}</a>}
      {editable && (
        <>
          <span className="study-img-tools">
            {(["left", "center", "right"] as ImageAlign[]).map((a) => (
              <button key={a} type="button" className={`btn${align === a ? " active" : ""}`} title={`Align ${a}`} aria-label={`Align image ${a}`} aria-pressed={align === a} onClick={() => emit({ ...latest.current, align: a === "left" ? undefined : a })}>
                {GLYPH[a]}
              </button>
            ))}
            <button type="button" className="btn" title="Make it the full width of the page" aria-label="Full width" onClick={() => emit({ ...latest.current, width: { value: 100, unit: "%" } })}>
              100%
            </button>
            <button type="button" className="btn" title="Show it at its own size" aria-label="Natural size" onClick={() => emit({ ...latest.current, width: undefined })}>
              1:1
            </button>
          </span>
          <span
            className="study-img-handle"
            role="slider"
            tabIndex={0}
            aria-label="Resize image (drag, or use the left and right arrow keys)"
            aria-valuemin={5}
            aria-valuemax={100}
            aria-valuenow={attrs.width?.unit === "%" ? attrs.width.value : 100}
            onPointerDown={startResize}
            onKeyDown={nudge}
          />
        </>
      )}
    </figure>
  );
}
