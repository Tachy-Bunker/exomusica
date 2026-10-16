// The room's controls as pictures: one line icon per action, the shortcut letter as a keycap (desktop), and the name on hover
// (desktop) or under the icon (touch). The name stays in the DOM for screen readers and tests.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export type GlyphName = "page" | "map" | "note" | "ping" | "scan" | "lock" | "door" | "hud" | "eye" | "eyeoff" | "book" | "back" | "cross" | "pencil";

const SHAPE: Record<GlyphName, ReactNode> = {
  page: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h4" /></>,
  map: <><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  note: <><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></>,
  ping: <><circle cx="12" cy="12" r="1.8" /><path d="M7.5 8.5a5.5 5.5 0 0 0 0 7M16.5 8.5a5.5 5.5 0 0 1 0 7M4.6 5.6a10 10 0 0 0 0 12.8M19.4 5.6a10 10 0 0 1 0 12.8" /></>,
  scan: <><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /><circle cx="12" cy="12" r="2.2" /></>,
  lock: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="1.3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
  door: <><path d="M6 21V4h12v17M4 21h16" /><circle cx="14.5" cy="12.5" r=".7" /></>,
  hud: <><rect x="3" y="4" width="18" height="13" rx="1.5" /><path d="M8 21h8M12 17v4" /></>,
  eye: <><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  eyeoff: <><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="2.8" /><path d="M3 3l18 18" /></>,
  book: <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6" /></>,
  back: <><path d="M10 6l-6 6 6 6M4 12h12" /></>,
  cross: <><path d="M6 6l12 12M18 6L6 18" /></>,
  pencil: <><path d="M4 20l4-1 11-11-3-3L5 16z" /><path d="M14 6l3 3" /></>,
};

export function Glyph({ name }: { name: GlyphName }) {
  return <svg className="rg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{SHAPE[name]}</svg>;
}

interface TileProps { icon: GlyphName; label: string; keys?: string; pressed?: boolean; disabled?: boolean; wide?: boolean; testid: string; onClick?: () => void; to?: string }

function inside({ icon, label, keys }: TileProps): ReactNode {
  return (<>
    <Glyph name={icon} />
    {keys && <kbd>{keys}</kbd>}
    <span className="rb-l">{label}</span>
  </>);
}

/** A control as a tile: a button, or a link when `to` is given. */
export function RoomTile(p: TileProps) {
  const cls = p.wide ? "rb rb-wide" : "rb";
  if (p.to) return <Link to={p.to} className={cls} data-testid={p.testid} data-tip={p.label} aria-label={p.label}>{inside(p)}</Link>;
  return <button type="button" className={cls} data-testid={p.testid} data-tip={p.label} aria-label={p.label} aria-pressed={p.pressed} aria-disabled={p.disabled} onClick={p.onClick}>{inside(p)}</button>;
}
