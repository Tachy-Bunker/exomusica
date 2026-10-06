import type { ConversationKind } from "../lib/spaceHubs";

/** A small celestial body for each kind of conversation: branch = ringed planet, topic = comet, study = probe, question = star. */
export function SpaceGlyph({ kind }: { kind: ConversationKind }) {
  return (
    <svg className="glyph" viewBox="0 0 44 44" width="44" height="44" aria-hidden="true" focusable="false">
      {kind === "branch" && (
        <>
          <circle cx="22" cy="22" r="9" fill="currentColor" opacity="0.85" />
          <ellipse cx="22" cy="22" rx="18" ry="5.5" transform="rotate(-22 22 22)" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.9" />
        </>
      )}
      {kind === "topic" && (
        <>
          <circle cx="31" cy="13" r="6" fill="currentColor" />
          <path d="M26 17 L6 36 M28 19 L12 38 M24 14 L4 28" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.5" fill="none" />
        </>
      )}
      {kind === "study" && (
        <>
          <rect x="16" y="17" width="12" height="10" rx="2" fill="currentColor" opacity="0.9" />
          <rect x="4" y="19" width="9" height="6" fill="currentColor" opacity="0.55" />
          <rect x="31" y="19" width="9" height="6" fill="currentColor" opacity="0.55" />
          <path d="M22 17 V10 M13 22 H16 M28 22 H31" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <circle cx="22" cy="8.5" r="2" fill="currentColor" />
        </>
      )}
      {kind === "question" && <path d="M22 6 L26 18 L38 22 L26 26 L22 38 L18 26 L6 22 L18 18 Z" fill="currentColor" opacity="0.85" />}
    </svg>
  );
}

/** Four bars that fill as a conversation gets busier. The meaning is also in the label, never only in the picture. */
export function SignalBars({ level, label }: { level: 0 | 1 | 2 | 3 | 4; label: string }) {
  return (
    <span className={`signal lv${level}`} role="img" aria-label={`Signal: ${label}`}>
      <i /><i /><i /><i />
    </span>
  );
}
