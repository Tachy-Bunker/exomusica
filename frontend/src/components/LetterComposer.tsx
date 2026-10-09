import { useRef, useState, type PointerEvent as RPE } from "react";
import { COLORS, PAPERS, STAMPS, STAMP_NAME, W, H, strokePath, thin, type Doc, type Item } from "../lib/letterDoc";
import { LetterView } from "./LetterView";

type Tool = "pen" | "text" | "stamp" | "move";
const TOOLS: [Tool, string][] = [["pen", "Ink"], ["text", "Text"], ["stamp", "Stamp"], ["move", "Move"]];

/** The sheet. Ink is drawn straight into the DOM while the pointer moves (no re-render per point) and committed on release, so it stays smooth on weak devices. */
export function LetterComposer({ onChange }: { onChange: (d: Doc) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [bg, setBg] = useState<string>("paper");
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(COLORS[0]);
  const [width, setWidth] = useState(4);
  const [text, setText] = useState("");
  const [stamp, setStamp] = useState<string>(STAMPS[0]);
  const [sel, setSel] = useState(-1);
  const svgBox = useRef<HTMLDivElement>(null);
  const live = useRef<SVGPathElement>(null);
  const pts = useRef<number[]>([]);
  const drag = useRef<{ i: number; dx: number; dy: number } | null>(null);

  const commit = (next: Item[], b = bg) => { setItems(next); onChange({ bg: b, items: next }); };
  const at = (e: RPE) => {
    const svg = svgBox.current!.querySelector("svg")!, r = svg.getBoundingClientRect();
    const s = Math.min(r.width / W, r.height / H), ox = (r.width - W * s) / 2, oy = (r.height - H * s) / 2;
    return [Math.round(Math.min(W, Math.max(0, (e.clientX - r.left - ox) / s))), Math.round(Math.min(H, Math.max(0, (e.clientY - r.top - oy) / s)))] as const;
  };

  function down(e: RPE) {
    const [x, y] = at(e);
    if (tool === "pen") {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      pts.current = [x, y];
      live.current?.setAttribute("d", strokePath([x, y]));
      live.current?.setAttribute("stroke", color); live.current?.setAttribute("stroke-width", String(width));
    } else if (tool === "text") {
      if (!text.trim()) return;
      commit([...items, { t: "x", x, y, r: 0, s: 36, c: color, k: 0, v: text.trim() }]); setSel(items.length); setTool("move");
    } else if (tool === "stamp") {
      commit([...items, { t: "m", x, y, r: 0, s: 90, c: color, g: stamp }]); setSel(items.length); setTool("move");
    } else {
      const hit = (e.target as Element).closest("[data-i]");
      const i = hit ? Number(hit.getAttribute("data-i")) : -1;
      setSel(i);
      const it = items[i];
      if (it && it.t !== "s") { (e.currentTarget as Element).setPointerCapture(e.pointerId); drag.current = { i, dx: x - it.x, dy: y - it.y }; }
    }
  }
  function move(e: RPE) {
    if (tool === "pen" && pts.current.length) {
      const [x, y] = at(e), p = pts.current;
      if (Math.abs(x - p[p.length - 2]) + Math.abs(y - p[p.length - 1]) < 4) return; // skip tiny steps: fewer points, lighter file
      p.push(x, y);
      live.current?.setAttribute("d", strokePath(p));
    } else if (drag.current) {
      const [x, y] = at(e), d = drag.current;
      setItems((cur) => cur.map((it, i) => (i === d.i && it.t !== "s" ? { ...it, x: Math.round(x - d.dx), y: Math.round(y - d.dy) } : it)));
    }
  }
  function up() {
    if (tool === "pen" && pts.current.length) {
      const p = thin(pts.current);
      pts.current = []; live.current?.setAttribute("d", "");
      commit([...items, { t: "s", c: color, w: width, p }]);
    } else if (drag.current) { drag.current = null; onChange({ bg, items }); }
  }
  const patch = (f: (it: Item) => Item) => commit(items.map((it, i) => (i === sel ? f(it) : it)));
  const cur = items[sel];

  return (
    <div className="composer" data-testid="composer">
      <div className="comp-tools" role="toolbar" aria-label="Drawing tools">
        {TOOLS.map(([t, label]) => <button key={t} type="button" className={`btn${tool === t ? " btn-primary" : ""}`} aria-pressed={tool === t} onClick={() => setTool(t)} data-testid={`tool-${t}`}>{label}</button>)}
        <span className="comp-sep" />
        {COLORS.map((c) => <button key={c} type="button" className={`comp-swatch${color === c ? " on" : ""}`} style={{ background: c }} aria-label={`Colour ${c}`} aria-pressed={color === c} onClick={() => { setColor(c); if (cur) patch((it) => (it.t === "s" ? it : { ...it, c })); }} />)}
        <span className="comp-sep" />
        <button type="button" className="btn" onClick={() => { commit(items.slice(0, -1)); setSel(-1); }} disabled={!items.length} data-testid="comp-undo">Undo</button>
        <button type="button" className="btn" onClick={() => { commit([]); setSel(-1); }} disabled={!items.length}>Clear</button>
        <select value={bg} onChange={(e) => { setBg(e.target.value); onChange({ bg: e.target.value, items }); }} aria-label="Paper">{PAPERS.map((p) => <option key={p} value={p}>{p}</option>)}</select>
      </div>
      {tool === "pen" && <label className="comp-row">Ink width <input type="range" min={1} max={14} value={width} onChange={(e) => setWidth(Number(e.target.value))} aria-label="Ink width" /></label>}
      {tool === "text" && <input className="comp-text" value={text} maxLength={120} onChange={(e) => setText(e.target.value)} placeholder="Type the words, then click the sheet to put them down" aria-label="Words" data-testid="comp-text" />}
      {tool === "stamp" && <div className="comp-stamps" role="group" aria-label="Stamps">{STAMPS.map((s) => <button key={s} type="button" className={`btn${stamp === s ? " btn-primary" : ""}`} aria-pressed={stamp === s} onClick={() => setStamp(s)}>{STAMP_NAME[s]}</button>)}</div>}
      <div className="comp-sheet" ref={svgBox} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-testid="comp-sheet">
        <LetterView doc={{ bg, items }} selected={sel} />
        <svg viewBox={`0 0 ${W} ${H}`} className="letter-svg comp-live" aria-hidden="true"><path ref={live} fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      {cur && cur.t !== "s" && (
        <div className="comp-inspect" data-testid="comp-inspect">
          <label>Size <input type="range" min={cur.t === "x" ? 10 : 20} max={cur.t === "x" ? 120 : 220} value={cur.s} onChange={(e) => patch((it) => (it.t === "s" ? it : { ...it, s: Number(e.target.value) }))} aria-label="Size" /></label>
          <label>Turn <input type="range" min={-180} max={180} value={cur.r} onChange={(e) => patch((it) => (it.t === "s" ? it : { ...it, r: Number(e.target.value) }))} aria-label="Turn" /></label>
          {cur.t === "x" && <label>Curve <input type="range" min={-100} max={100} value={cur.k} onChange={(e) => patch((it) => (it.t === "x" ? { ...it, k: Number(e.target.value) } : it))} aria-label="Curve" data-testid="comp-curve" /></label>}
          <button type="button" className="btn btn-danger" onClick={() => { commit(items.filter((_, i) => i !== sel)); setSel(-1); }}>Remove</button>
        </div>
      )}
      <p className="home-dim">{items.length} {items.length === 1 ? "mark" : "marks"}. Ink and stamps stay as drawn; text and stamps can be moved, turned and resized, and text can be curved.</p>
    </div>
  );
}
