import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

interface Pending { id: number; username: string; say: string; channelSlug: string | null }

/** On Home: the newcomers you were asked to greet. The link opens the chat with "Welcome @name !" already in the box. */
export function WelcomeCard() {
  const [list, setList] = useState<Pending[]>([]);
  useEffect(() => { api<Pending[]>("/api/welcome/pending").then((l) => setList(Array.isArray(l) ? l : [])).catch(() => undefined); }, []);
  if (list.length === 0) return null;
  const done = (id: number) => { setList((l) => l.filter((x) => x.id !== id)); void api(`/api/welcome/${id}/done`, { method: "POST" }).catch(() => undefined); };
  return (
    <aside className="digest" data-testid="welcome-card" aria-label="Newcomers to greet">
      <div className="digest-head"><b>You're a welcome buddy</b></div>
      <ul>
        {list.map((p) => (
          <li key={p.id} data-testid="welcome-item">
            <b>{p.username}</b> just joined.{" "}
            {p.channelSlug && <Link to={`/topic/${p.channelSlug}?say=${encodeURIComponent(p.say)}`} onClick={() => done(p.id)} data-testid="welcome-say">Say hello</Link>}
            {" · "}<button type="button" className="linklike" onClick={() => done(p.id)} data-testid="welcome-skip">skip</button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
