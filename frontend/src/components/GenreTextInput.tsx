import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

let cachedAllGenres: string[] | null = null;

async function loadAllGenres(): Promise<string[]> {
  if (cachedAllGenres) return cachedAllGenres;
  cachedAllGenres = await api<string[]>("/api/genres");
  return cachedAllGenres;
}

/** A comma-separated genre text input with a scrollable autocomplete
 *  dropdown of every genre used across all tracks sitewide, so existing
 *  genres get reused rather than accidentally duplicated by spelling
 *  variants. */
export function GenreTextInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [allGenres, setAllGenres] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && allGenres.length === 0) loadAllGenres().then(setAllGenres);
  }, [open, allGenres.length]);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  // The word currently being typed (after the last comma) is what gets
  // matched against and completed - earlier, already-finished genres in
  // the field are left alone.
  const parts = value.split(",");
  const currentWord = parts[parts.length - 1].trim().toLowerCase();
  const alreadyUsed = new Set(parts.slice(0, -1).map((g) => g.trim().toLowerCase()));
  const suggestions = currentWord
    ? allGenres.filter((g) => g.toLowerCase().includes(currentWord) && !alreadyUsed.has(g.toLowerCase())).slice(0, 40)
    : allGenres.filter((g) => !alreadyUsed.has(g.toLowerCase())).slice(0, 40);

  function pickSuggestion(genre: string) {
    const prefix = parts.slice(0, -1);
    onChange([...prefix, ` ${genre}`].join(",").replace(/^,\s*/, "") + ", ");
    setOpen(false);
  }

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={{ minWidth: 220 }}
      />
      {open && suggestions.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "0.3rem",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "0.3rem",
            width: 220,
            maxHeight: 220,
            overflowY: "auto",
            zIndex: 30,
            boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
          }}
        >
          {suggestions.map((g) => (
            <button
              key={g}
              type="button"
              className="btn"
              onMouseDown={(e) => e.preventDefault()} // keep the input focused so this click doesn't blur it before onClick fires
              onClick={() => pickSuggestion(g)}
              style={{ display: "block", width: "100%", textAlign: "left", fontSize: "0.8rem", marginBottom: "0.1rem" }}
            >
              {g}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
