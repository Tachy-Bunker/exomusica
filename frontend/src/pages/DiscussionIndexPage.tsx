import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import type { Branch } from "../lib/types";

interface ChannelSummary {
  slug: string;
  name: string;
}

export function DiscussionIndexPage() {
  useDocumentTitle("Forums");
  const [topics, setTopics] = useState<ChannelSummary[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    api<ChannelSummary[]>("/api/channels?kind=DISCUSSION").then(setTopics);
    api<Branch[]>("/api/branches").then(setBranches);
  }, []);

  return (
    <div>
      <h1>Forums</h1>

      <h2 style={{ fontSize: "1rem", color: "var(--accent-forum)" }}>Topics</h2>
      {topics.length === 0 && <p style={{ color: "var(--text-dim)" }}>No topics yet.</p>}
      <ul style={{ listStyle: "none", padding: 0, marginBottom: "1.5rem" }}>
        {topics.map((t) => (
          <li key={t.slug} style={{ marginBottom: "0.5rem" }}>
            <Link to={`/topic/${t.slug}`}>{t.name}</Link>
          </li>
        ))}
      </ul>

      <h2 style={{ fontSize: "1rem", color: "var(--accent-audio)" }}>Branches</h2>
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
