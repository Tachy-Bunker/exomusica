import { Link } from "react-router-dom";
import { freqOf, showFreq, TYPE_LABEL, type EntityType, type Peek } from "../lib/atlas";
import { setArrival, type Edge } from "../lib/arrive";
import { AlbumIcon, ChallengeIcon, ChatIcon, NewsIcon, StudyIcon, WikiIcon } from "./ActivityIcons";

/** The one small card every kind of thing wears when it is listed outside its own page: a glyph or picture, a name, what it is, and its frequency. */
export function TypeGlyph({ type, size = 16 }: { type: EntityType; size?: number }) {
  switch (type) {
    case "study": return <StudyIcon size={size} />;
    case "news": return <NewsIcon size={size} />;
    case "wiki": return <WikiIcon size={size} />;
    case "album": return <AlbumIcon size={size} />;
    case "call": return <ChallengeIcon size={size} />;
    case "topic": return <ChatIcon size={size} />;
    case "branch": return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M12 21V11M12 11C12 7 9 5 5 5M12 11c0-3 2.5-5 7-6" /><circle cx="5" cy="5" r="1.6" fill="currentColor" /><circle cx="19" cy="5" r="1.6" fill="currentColor" /></svg>
    );
    case "resource": return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M4 8l8-4 8 4v8l-8 4-8-4z M4 8l8 4 8-4 M12 12v8" /></svg>
    );
  }
}

export function Plate({ peek, note, edge, onPick, children }: { peek: Peek; note?: string; edge?: Edge; onPick?: () => void; children?: React.ReactNode }) {
  return (
    <div className="plate" data-type={peek.type}>
      <Link className="plate-link" to={peek.href} draggable onClick={() => { if (edge) setArrival(edge); onPick?.(); }} aria-label={`${peek.title} (${TYPE_LABEL[peek.type]})`} data-testid="plate">
        <span className="plate-thumb" aria-hidden="true">
          {peek.image ? <img src={peek.image} alt="" loading="lazy" decoding="async" draggable={false} /> : null}
          <span className="plate-glyph"><TypeGlyph type={peek.type} size={15} /></span>
        </span>
        <span className="plate-text">
          <b className="plate-title">{peek.title}</b>
          <span className="plate-sub">{note ?? peek.sub ?? TYPE_LABEL[peek.type]}</span>
        </span>
        <span className="plate-freq" aria-hidden="true">{showFreq(freqOf(peek.type, peek.id))}</span>
      </Link>
      {children}
    </div>
  );
}
