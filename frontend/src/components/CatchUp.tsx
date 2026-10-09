import type { Reel } from "../lib/chatStrip";
import type { MessageDTO } from "../lib/types";

const excerpt = (m: MessageDTO): string => (m.kind && m.kind !== "text" ? m.contentRaw : m.contentRaw.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")).replace(/\s+/g, " ").slice(0, 90);

/** "While you were away": how much, who, and the few messages that mattered. Chosen by reactions, structure and substance: no AI, same answer every time. */
export function CatchUp({ reel, onPick, onFirst, onLive, onClose }: { reel: Reel; onPick: (m: MessageDTO) => void; onFirst: () => void; onLive: () => void; onClose: () => void }) {
  const who = reel.people.length <= 3 ? reel.people.join(", ") : `${reel.people.slice(0, 2).join(", ")} +${reel.people.length - 2}`;
  return (
    <section className="catchup" data-testid="catchup" aria-label="While you were away">
      <header><b>{reel.count}{reel.count >= 100 ? "+" : ""}</b> new while you were away <span className="home-dim">· {who}</span><button type="button" className="catchup-x" onClick={onClose} aria-label="Dismiss" data-testid="catchup-close">×</button></header>
      <ul>
        {reel.highlights.map((m) => (
          <li key={m.id}><button type="button" onClick={() => onPick(m)} data-testid="catchup-pick"><b>{m.authorUsername}</b> {excerpt(m)}</button></li>
        ))}
      </ul>
      <div className="catchup-actions"><button type="button" className="btn" onClick={onFirst} data-testid="catchup-first">First unread</button><button type="button" className="btn" onClick={onLive}>Skip to live</button></div>
    </section>
  );
}
