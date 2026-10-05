// Keeps the writing box and the preview showing the same part of the paper.
// A straight percentage doesn't work - a chart is one line of source but
// hundreds of pixels of preview - so matching landmarks (headings, placed
// figures) are measured in both panes and scrolling is interpolated between them.

export interface Anchor {
  /** Scroll position in the writing box. */
  a: number;
  /** The matching scroll position in the preview. */
  b: number;
}

/** Sort, and keep only anchors that strictly increase in both panes so the mapping is invertible. */
export function normalizeAnchors(list: Anchor[]): Anchor[] {
  const sorted = [...list].filter((x) => Number.isFinite(x.a) && Number.isFinite(x.b)).sort((p, q) => p.a - q.a || p.b - q.b);
  const out: Anchor[] = [];
  for (const x of sorted) {
    const prev = out[out.length - 1];
    if (!prev || (x.a > prev.a + 0.5 && x.b > prev.b + 0.5)) out.push(x);
  }
  return out;
}

export function mapScroll(value: number, anchors: Anchor[], from: "a" | "b"): number {
  if (anchors.length < 2) return value;
  const to = from === "a" ? "b" : "a";
  if (value <= anchors[0][from]) return anchors[0][to];
  for (let i = 1; i < anchors.length; i++) {
    const lo = anchors[i - 1];
    const hi = anchors[i];
    if (value <= hi[from]) {
      const span = hi[from] - lo[from];
      const t = span === 0 ? 0 : (value - lo[from]) / span;
      return lo[to] + t * (hi[to] - lo[to]);
    }
  }
  return anchors[anchors.length - 1][to];
}

/**
 * Vertical position of a character inside a textarea, accounting for line
 * wrapping, by laying the same text out in a hidden copy of it.
 */
export function textareaOffsetTop(ta: HTMLTextAreaElement, index: number): number {
  const cs = getComputedStyle(ta);
  const mirror = document.createElement("div");
  for (const prop of ["fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "lineHeight", "textTransform", "wordSpacing", "textIndent", "tabSize", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"] as const) {
    mirror.style[prop as never] = cs[prop as never];
  }
  mirror.style.boxSizing = "border-box";
  mirror.style.width = `${ta.clientWidth}px`; // clientWidth excludes the scrollbar, which also narrows the real text area
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.left = "-9999px";
  mirror.style.top = "0";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.textContent = ta.value.slice(0, index);
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const top = marker.offsetTop;
  document.body.removeChild(mirror);
  return top;
}
