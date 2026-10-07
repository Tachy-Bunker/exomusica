import type { Glyph } from "../lib/branchIdentity";

/** A branch's emblem: its glyph in its colour, on a softly tinted tile. Decorative (the name is always written next to it). */
export function BranchEmblem({ glyph, color, size = 40, imageUrl }: { glyph: Glyph; color: string; size?: number; imageUrl?: string | null }) {
  if (imageUrl) {
    return (
      <span className="emblem emblem-img" style={{ ["--emb" as string]: color, width: size, height: size }} aria-hidden="true">
        <img src={imageUrl} alt="" loading="lazy" width={size} height={size} />
      </span>
    );
  }
  return (
    <span className="emblem" style={{ ["--emb" as string]: color, width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" focusable="false">
        {glyph === "planet" && (<><circle cx="12" cy="12" r="5" fill="currentColor" fillOpacity="0.35" /><ellipse cx="12" cy="12" rx="10.5" ry="3.6" transform="rotate(-24 12 12)" /></>)}
        {glyph === "crystal" && (<><path d="M12 2.5 L18.5 9 L12 21.5 L5.5 9 Z" fill="currentColor" fillOpacity="0.25" /><path d="M5.5 9 H18.5 M12 2.5 L9.5 9 L12 21.5 L14.5 9 Z" /></>)}
        {glyph === "wave" && <path d="M1.5 12 C4 4 7 4 9 12 S14 20 16.5 12 S20 5 22.5 12" />}
        {glyph === "orbit" && (<><circle cx="12" cy="12" r="2.2" fill="currentColor" /><ellipse cx="12" cy="12" rx="9.5" ry="4.2" /><ellipse cx="12" cy="12" rx="9.5" ry="4.2" transform="rotate(60 12 12)" /></>)}
        {glyph === "bars" && (<><path d="M5 20 V13" /><path d="M9.5 20 V6" /><path d="M14 20 V10" /><path d="M18.5 20 V4" /></>)}
        {glyph === "leaf" && (<><path d="M5 19 C5 9 11 4 20 4 C20 13 15 19 5 19 Z" fill="currentColor" fillOpacity="0.25" /><path d="M5 19 L14 10" /></>)}
        {glyph === "star" && <path d="M12 2.5 L14.6 9.4 L21.5 12 L14.6 14.6 L12 21.5 L9.4 14.6 L2.5 12 L9.4 9.4 Z" fill="currentColor" fillOpacity="0.3" />}
        {glyph === "moon" && <path d="M19 14.5 A8 8 0 1 1 9.5 5 A6.5 6.5 0 0 0 19 14.5 Z" fill="currentColor" fillOpacity="0.3" />}
      </svg>
    </span>
  );
}
