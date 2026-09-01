import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { api } from "../lib/api";

const HAS_OPTIONS = ["sound", "image", "video", "link"];

interface Suggestion {
  type: "from" | "has";
  filter: string;
  start: number;
}

export function SearchBox({ channelSlug, onSearch }: { channelSlug: string; onSearch: (query: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<string[]>(`/api/channels/${channelSlug}/participants`).then(setParticipants);
  }, [channelSlug]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setValue(val);
    const cursor = e.target.selectionStart ?? val.length;
    const upto = val.slice(0, cursor);
    const fromMatch = upto.match(/from:(\S*)$/i);
    const hasMatch = upto.match(/has:(\S*)$/i);
    if (fromMatch) setSuggestion({ type: "from", filter: fromMatch[1].toLowerCase(), start: cursor - fromMatch[0].length });
    else if (hasMatch) setSuggestion({ type: "has", filter: hasMatch[1].toLowerCase(), start: cursor - hasMatch[0].length });
    else setSuggestion(null);
  }

  function applySuggestion(word: string) {
    if (!suggestion) return;
    const el = inputRef.current;
    const cursor = el?.selectionStart ?? value.length;
    const prefix = suggestion.type === "from" ? "from:" : "has:";
    const next = `${value.slice(0, suggestion.start)}${prefix}${word} ${value.slice(cursor)}`;
    setValue(next);
    setSuggestion(null);
    requestAnimationFrame(() => el?.focus());
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSuggestion(null);
    onSearch(value);
  }

  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)} title="Search this topic">
        🔎
      </button>
    );
  }

  const options =
    suggestion?.type === "from"
      ? participants.filter((p) => p.toLowerCase().includes(suggestion.filter))
      : suggestion?.type === "has"
        ? HAS_OPTIONS.filter((h) => h.startsWith(suggestion.filter))
        : [];

  return (
    <form onSubmit={handleSubmit} style={{ position: "relative", display: "flex", gap: "0.4rem" }}>
      {suggestion && options.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            marginBottom: "0.3rem",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "0.3rem",
            minWidth: 160,
            zIndex: 20,
            boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
          }}
        >
          {options.slice(0, 10).map((o) => (
            <button
              key={o}
              type="button"
              className="btn"
              style={{ display: "block", width: "100%", textAlign: "left", marginBottom: "0.15rem" }}
              onClick={() => applySuggestion(o)}
            >
              {suggestion.type === "from" ? `from:${o}` : `has:${o}`}
            </button>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        placeholder="Search… try from: or has:"
        value={value}
        onChange={handleChange}
      />
      <button className="btn" type="submit">
        Search
      </button>
      <button type="button" className="btn" onClick={() => setOpen(false)} title="Close search">
        ×
      </button>
    </form>
  );
}
