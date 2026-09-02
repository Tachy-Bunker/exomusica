import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useContentScaleStore } from "../lib/contentScaleStore";
import type { Branch } from "../lib/types";
import { ExportIcon } from "../components/Icons";
import { exportChatHistory } from "../lib/exportChat";

interface ChannelSummary {
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
}

export function DiscussionIndexPage() {
  useDocumentTitle("Forums");
  const isDesktop = useIsDesktop();
  const scale = useContentScaleStore((s) => (isDesktop ? s.desktop : s.mobile));
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
    <div style={{ fontSize: `${scale}rem` }}>
      <h1>Forums</h1>

      {topics.length === 0 && <p style={{ color: "var(--text-dim)" }}>No topics yet.</p>}
      <div className="forums-columns">
        {[...groups.entries()].map(([category, items]) => (
          <div key={category || "uncategorized"} style={{ marginBottom: "1rem", breakInside: "avoid" }}>
            {category && (
              <h3 style={{ fontSize: `${0.85 * scale}rem`, color: "var(--text-dim)", textTransform: "uppercase" }}>{category}</h3>
            )}
            <ul style={{ listStyle: "none", padding: 0 }}>
              {items.map((t) => (
                <li key={t.slug} style={{ marginBottom: "0.5rem" }}>
                  <Link to={`/topic/${t.slug}`}>{t.name}</Link>{" "}
                  <button className="export-icon-btn" onClick={() => exportChatHistory(t.slug)} title="Download this topic's chat history">
                    <ExportIcon size={16} />
                  </button>
                  {t.description && <div style={{ fontSize: `${0.8 * scale}rem`, color: "var(--text-dim)" }}>{t.description}</div>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: `${scale}rem`, color: "var(--text)", marginTop: "1.5rem" }}>Branches</h2>
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
