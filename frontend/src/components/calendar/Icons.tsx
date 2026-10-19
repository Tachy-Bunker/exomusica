// The calendar's small icons (fix415): inline SVG drawn in the current colour. No icon font, no image files.

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** A gear: eight teeth round a hub, computed once. */
const GEAR = (() => {
  const pts: string[] = [];
  const steps = 8 * 4;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2 - Math.PI / 2;
    const r = i % 4 === 1 || i % 4 === 2 ? 9.2 : 6.8;
    pts.push(`${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
})();

export function CogIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true" {...stroke}>
      <path d={GEAR} />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

/** The chain link (share the calendar). Drawn at 36 px in the header, so its glyph is twice the old size in the same button. */
export function LinkIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...stroke}>
      <path d="M10 13.5a4.5 4.5 0 0 0 6.36 0l3-3a4.5 4.5 0 0 0-6.36-6.36l-1.2 1.2M14 10.5a4.5 4.5 0 0 0-6.36 0l-3 3a4.5 4.5 0 0 0 6.36 6.36l1.2-1.2" />
    </svg>
  );
}

/** Share: a box with an arrow leaving it (copies the coordinates). */
export function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true" {...stroke}>
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

/** A map pin (Google Maps). */
export function GoogleMapsIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true" {...stroke}>
      <path d="M12 21.5s-6.5-5.9-6.5-11.3a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11.3-6.5 11.3z" />
      <circle cx="12" cy="10.2" r="2.3" />
    </svg>
  );
}

/** The flags of the two languages, drawn so they look the same on every system (an emoji flag does not on Windows). The language in use is lit. */
export function FlagGB({ on }: { on: boolean }) {
  return (
    <svg className={`cal-flag cal-flag-gb${on ? " is-on" : ""}`} viewBox="0 0 60 30" aria-hidden="true">
      <clipPath id="cal-gb-s"><path d="M0,0 v30 h60 v-30 z" /></clipPath>
      <clipPath id="cal-gb-t"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath>
      <g clipPath="url(#cal-gb-s)">
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#cal-gb-t)" stroke="#C8102E" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  );
}

export function FlagFR({ on }: { on: boolean }) {
  return (
    <svg className={`cal-flag cal-flag-fr${on ? " is-on" : ""}`} viewBox="0 0 3 2" aria-hidden="true">
      <rect width="1" height="2" fill="#002395" />
      <rect x="1" width="1" height="2" fill="#fff" />
      <rect x="2" width="1" height="2" fill="#ED2939" />
    </svg>
  );
}
