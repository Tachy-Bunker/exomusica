import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

interface ChannelSummary {
  slug: string;
  name: string;
}

export function DiscussionIndexPage() {
  const [topics, setTopics] = useState<ChannelSummary[]>([]);

  useEffect(() => {
    api<ChannelSummary[]>("/api/channels?kind=DISCUSSION").then(setTopics);
  }, []);

  return (
    <div>
      <h1>Discussion</h1>
      {topics.length === 0 && <p style={{ color: "var(--text-dim)" }}>No topics yet.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {topics.map((t) => (
          <li key={t.slug} style={{ marginBottom: "0.5rem" }}>
            <Link to={`/topic/${t.slug}`}>{t.name}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
