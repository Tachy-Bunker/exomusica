import { useEffect } from "react";
import { renderInlineMarkdown } from "../lib/markdown";
import { useGlossaryData } from "../lib/glossary";

/** The Glossary page's content: every term, A to Z, drawn where a {glossary} line sits. Layouts: {glossary list}, {glossary cards}, {glossary columns}. */
export function GlossaryList({ layout }: { layout: "list" | "cards" | "columns" }) {
  const data = useGlossaryData();
  useEffect(() => {
    if (data && location.hash.startsWith("#term-")) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "center" });
  }, [data]);
  if (!data) return <p className="home-dim">Loading the glossary…</p>;
  if (!Array.isArray(data.terms) || data.terms.length === 0) return <p className="home-dim">No terms yet.</p>;
  return (
    <dl className={`glossary-list glossary-${layout}`} data-testid="glossary-list">
      {data.terms.map((t) => (
        <div key={t.id} id={`term-${t.id}`} className="glossary-item" data-testid="glossary-item">
          <dt>{t.term}{t.aliases.length > 0 && <span className="glossary-aka"> · also {t.aliases.join(", ")}</span>}</dt>
          <dd>{renderInlineMarkdown(t.definition)}</dd>
        </div>
      ))}
    </dl>
  );
}
