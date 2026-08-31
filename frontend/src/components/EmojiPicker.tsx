import { useEffect } from "react";
import { useEmojiStore, type Emoji } from "../lib/emojiStore";

export function EmojiPicker({ filter = "", onSelect }: { filter?: string; onSelect: (emoji: Emoji) => void }) {
  const { emojis, load } = useEmojiStore();

  useEffect(() => {
    load();
  }, [load]);

  const filtered = emojis.filter((e) => e.name.includes(filter.toLowerCase())).slice(0, 30);

  return (
    <div className="emoji-picker">
      {filtered.length === 0 && (
        <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", padding: "0.3rem", margin: 0 }}>
          {emojis.length === 0 ? "No emoji uploaded yet." : `No match for "${filter}"`}
        </p>
      )}
      {filtered.map((e) => (
        <button key={e.id} type="button" onClick={() => onSelect(e)} title={`:${e.name}:`}>
          <img src={e.imageUrl} alt={e.name} />
        </button>
      ))}
    </div>
  );
}
