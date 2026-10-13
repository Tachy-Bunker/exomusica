import { Link } from "react-router-dom";
import type { GlossaryEntry } from "../lib/glossary";

/** A glossary term inside an article: a dotted underline, and a small card with the definition (pure CSS to show, like the citation card). */
export function GlossRef({ word, entry, pageSlug }: { word: string; entry: GlossaryEntry; pageSlug: string | null }) {
  const href = pageSlug ? `/wiki/${pageSlug}#term-${entry.id}` : null;
  return (
    <span className="gloss" tabIndex={0} data-testid="gloss-ref">
      {word}
      <span className="gloss-card" role="tooltip" data-testid="gloss-card">
        <b>{entry.term}</b>
        <span>{entry.definition}</span>
        {href && <Link to={href} className="gloss-more">In the glossary →</Link>}
      </span>
    </span>
  );
}
