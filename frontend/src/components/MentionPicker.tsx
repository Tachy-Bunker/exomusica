import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface MentionUser {
  username: string;
  avatarUrl: string | null;
  isGhost: boolean;
}

export function MentionPicker({ filter, onSelect }: { filter: string; onSelect: (username: string) => void }) {
  const [results, setResults] = useState<MentionUser[]>([]);

  useEffect(() => {
    if (filter.length === 0) {
      setResults([]);
      return;
    }
    api<MentionUser[]>(`/api/users/mention-search?q=${encodeURIComponent(filter)}`).then(setResults);
  }, [filter]);

  if (results.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: "100%",
        left: 0,
        marginBottom: "0.3rem",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        minWidth: 180,
        zIndex: 20,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      {results.map((u) => (
        <button
          key={u.username}
          type="button"
          onClick={() => onSelect(u.username)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            width: "100%",
            textAlign: "left",
            padding: "0.4rem 0.6rem",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text)",
          }}
        >
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: u.avatarUrl ? `url(${u.avatarUrl}) center/cover` : "var(--bg-inset)",
              flexShrink: 0,
            }}
          />
          {u.username}
          {u.isGhost && <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>(ghost)</span>}
        </button>
      ))}
    </div>
  );
}
