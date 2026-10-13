import { useEffect } from "react";
import { useEmojiStore, type Emoji } from "../lib/emojiStore";
import { paletteFirst, useReactionPalette } from "../lib/reactionPalette";

export function EmojiPicker({ filter = "", onSelect, branchFirst = false }: { filter?: string; onSelect: (emoji: Emoji) => void; branchFirst?: boolean }) {
  const { emojis, load } = useEmojiStore();
  const ids = useReactionPalette((s) => s.ids);

  useEffect(() => {
    load();
  }, [load]);

  const matching = emojis.filter((e) => e.name.includes(filter.toLowerCase()));
  const { picked, rest } = branchFirst && !filter ? paletteFirst(matching, ids) : { picked: [] as Emoji[], rest: matching };
  const filtered = [...picked, ...rest].slice(0, 30);

  return (
    <div className="emoji-picker">
      {filtered.length === 0 && (
        <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", padding: "0.3rem", margin: 0 }}>
          {emojis.length === 0 ? "No emoji uploaded yet." : `No match for "${filter}"`}
        </p>
      )}
      {filtered.map((e) => (
        <button key={e.id} type="button" className={picked.includes(e) ? "branch-pick" : undefined} onClick={() => onSelect(e)} title={`:${e.name}:`}>
          <img src={e.imageUrl} alt={e.name} />
        </button>
      ))}
    </div>
  );
}
