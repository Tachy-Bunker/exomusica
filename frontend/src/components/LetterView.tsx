import { memo, useId } from "react";
import { PAPER_BG, W, H, arcPath, strokePath, textLen, type Doc, type Item } from "../lib/letterDoc";

/** Each stamp is drawn in a 100x100 box around (0,0). Plain shapes: nothing here can carry a script. */
function Stamp({ g, c }: { g: string; c: string }) {
  const f = { fill: "none", stroke: c, strokeWidth: 5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const label = (t: string, size = 34) => <text textAnchor="middle" y={size * 0.36} fontSize={size} fontWeight={800} fill={c} style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}>{t}</text>;
  switch (g) {
    case "cq": return <><circle r="44" {...f} />{label("CQ")}</>;
    case "73": return <><rect x="-44" y="-30" width="88" height="60" rx="8" {...f} />{label("73")}</>;
    case "qsl": return <><rect x="-46" y="-30" width="92" height="60" {...f} strokeDasharray="8 6" />{label("QSL", 28)}</>;
    case "tx": return <><path d="M-44 -26h88v52h-88z" {...f} />{label("TX", 30)}</>;
    case "star": return <path d="M0 -44L12 -14L44 -12L19 8L27 40L0 22L-27 40L-19 8L-44 -12L-12 -14Z" {...f} />;
    case "wave": return <path d="M-44 0Q-33 -34 -22 0T0 0T22 0T44 0" {...f} />;
    case "eye": return <><path d="M-44 0Q0 -40 44 0Q0 40 -44 0Z" {...f} /><circle r="12" {...f} /></>;
    default: return <><circle cx="-26" cy="0" r="12" {...f} /><path d="M-14 0H40M24 0V14M40 0V10" {...f} /></>;
  }
}

const ItemView = memo(function ItemView({ it, i, sel, uid }: { it: Item; i: number; sel: boolean; uid: string }) {
  if (it.t === "s") return <path data-i={i} d={strokePath(it.p)} fill="none" stroke={it.c} strokeWidth={it.w} strokeLinecap="round" strokeLinejoin="round" />;
  const tf = `translate(${it.x} ${it.y}) rotate(${it.r})`;
  if (it.t === "m") return <g data-i={i} transform={`${tf} scale(${it.s / 100})`} className={sel ? "lt-sel" : undefined}><Stamp g={it.g} c={it.c} /></g>;
  const len = textLen(it.v, it.s);
  const id = `${uid}-${i}`;
  return (
    <g data-i={i} transform={tf} className={sel ? "lt-sel" : undefined}>
      {it.k !== 0 && <path id={id} d={arcPath(len, it.k)} fill="none" />}
      {it.k !== 0
        ? <text fontSize={it.s} fill={it.c} textAnchor="middle" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}><textPath href={`#${id}`} startOffset="50%">{it.v}</textPath></text>
        : <text fontSize={it.s} fill={it.c} textAnchor="middle" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>{it.v}</text>}
    </g>
  );
});

/** Draws a letter. Memoised per item, so dragging one thing never redraws the ink. */
export const LetterView = memo(function LetterView({ doc, selected = -1, className }: { doc: Doc; selected?: number; className?: string }) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className ?? "letter-svg"} role="img" aria-label="A drawn letter" preserveAspectRatio="xMidYMid meet" data-testid="letter-svg">
      <rect width={W} height={H} fill={PAPER_BG[doc.bg] ?? PAPER_BG.paper} />
      {doc.bg === "grid" && <path d={Array.from({ length: 19 }, (_, k) => `M${(k + 1) * 50} 0V${H}`).join("") + Array.from({ length: 13 }, (_, k) => `M0 ${(k + 1) * 50}H${W}`).join("")} stroke="#1b1b1f" strokeOpacity="0.12" strokeWidth="1" />}
      {doc.items.map((it, i) => <ItemView key={i} it={it} i={i} sel={i === selected} uid={uid} />)}
    </svg>
  );
});
