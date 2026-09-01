import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import type { Branch } from "../lib/types";

interface ChannelSummary {
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
}

export function DiscussionIndexPage() {
  useDocumentTitle("Forums");
  const [topics, setTopics] = useState<ChannelSummary[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    api<ChannelSummary[]>("/api/channels?kind=DISCUSSION").then(setTopics);
    api<Branch[]>("/api/branches").then(setBranches);
  }, []);

  // Already ordered by position from the API — group by category while
  // preserving that order, uncategorized topics fall into a plain group.
  const groups = new Map<string, ChannelSummary[]>();
  for (const t of topics) {
    const key = t.category ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  return (
    <div>
      <h1>Forums</h1>

      <h2 style={{ fontSize: "1rem", color: "var(--accent-forum)" }}>Topics</h2>
      {topics.length === 0 && <p style={{ color: "var(--text-dim)" }}>No topics yet.</p>}
      {[...groups.entries()].map(([category, items]) => (
        <div key={category || "uncategorized"} style={{ marginBottom: "1rem" }}>
          {category && <h3 style={{ fontSize: "0.85rem", color: "var(--text-dim)", textTransform: "uppercase" }}>{category}</h3>}
          <ul style={{ listStyle: "none", padding: 0 }}>
            {items.map((t) => (
              <li key={t.slug} style={{ marginBottom: "0.5rem" }}>
                <Link to={`/topic/${t.slug}`}>{t.name}</Link>
                {t.description && <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>{t.description}</div>}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <h2 style={{ fontSize: "1rem", color: "var(--accent-audio)", marginTop: "1.5rem" }}>Branches</h2>
      {branches.length === 0 && <p style={{ color: "var(--text-dim)" }}>No branches yet.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {branches.map((b) => (
          <li key={b.id} style={{ marginBottom: "0.5rem" }}>
            <Link to={`/branch/${b.slug}`}>{b.name}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
