import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { renderMarkdown } from "../lib/markdown";

interface WikiSummary {
  id: number;
  slug: string;
  title: string;
  parentId: number | null;
}

interface WikiFull extends WikiSummary {
  contentMarkdown: string;
}

export function WikiPage() {
  const { slug } = useParams<{ slug?: string }>();
  const [pages, setPages] = useState<WikiSummary[]>([]);
  const [current, setCurrent] = useState<WikiFull | null>(null);

  useEffect(() => {
    api<WikiSummary[]>("/api/wiki").then(setPages);
  }, []);

  useEffect(() => {
    if (!slug) {
      setCurrent(null);
      return;
    }
    api<WikiFull>(`/api/wiki/${slug}`).then(setCurrent);
  }, [slug]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "2rem" }}>
      <nav>
        <h3 style={{ fontSize: "0.9rem" }}>Pages</h3>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {pages
            .filter((p) => !p.parentId)
            .map((p) => (
              <li key={p.id} style={{ marginBottom: "0.3rem" }}>
                <Link to={`/wiki/${p.slug}`}>{p.title}</Link>
                <ul style={{ listStyle: "none", paddingLeft: "0.8rem" }}>
                  {pages
                    .filter((c) => c.parentId === p.id)
                    .map((c) => (
                      <li key={c.id}>
                        <Link to={`/wiki/${c.slug}`}>{c.title}</Link>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
        </ul>
      </nav>
      <div>
        {!slug && <p style={{ color: "var(--text-dim)" }}>Pick a page from the list.</p>}
        {slug && !current && <p>Loading…</p>}
        {current && renderMarkdown(current.contentMarkdown)}
      </div>
    </div>
  );
}
