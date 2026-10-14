import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { Loading } from "../components/Loading";

interface Entry { id: number; at: number; author: string; channel: string; text: string }
const STEP_MS = 2600, SHOWN = 10;
const when = (at: number) => new Date(at * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/** Founders' door: the earliest recovered logs, played back one line at a time. One request; a timer runs only while it is playing and the tab is visible. */
export function VaultPage() {
  useDocumentTitle("The vault");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const tail = useRef<HTMLOListElement>(null);

  useEffect(() => {
    let alive = true;
    api<{ locked: boolean; entries: Entry[] }>("/api/vault").then((r) => { if (!alive) return; setLocked(!!r.locked); setEntries(r.entries ?? []); }).catch(() => alive && setEntries([]));
    return () => { alive = false; };
  }, []);
  const n = entries?.length ?? 0;
  useEffect(() => {
    if (!playing || n === 0) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setI((x) => { if (x >= n - 1) { setPlaying(false); return x; } return x + 1; });
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [playing, n]);
  useEffect(() => { if (tail.current) tail.current.scrollTop = tail.current.scrollHeight; }, [i]);

  if (entries === null) return <Loading />;
  if (locked) return <p className="home-dim" data-testid="vault-locked">This door is still closed. <Link to="/field-log">See what opens it</Link></p>;
  if (n === 0) return <p className="home-dim" data-testid="vault-empty">Nothing has been recovered yet.</p>;
  const cur = entries[i], shown = entries.slice(Math.max(0, i - SHOWN + 1), i + 1);
  return (
    <div className="vault-page" data-testid="vault-page">
      <h1>The vault</h1>
      <p className="home-dim">The earliest recovered logs, in order. <Link to="/field-log">Field Log</Link></p>
      <div className="vault-bar">
        <button type="button" className="btn" onClick={() => { if (!playing && i >= n - 1) setI(0); setPlaying((p) => !p); }} data-testid="vault-play" aria-pressed={playing}>{playing ? "Pause" : i >= n - 1 && i > 0 ? "Replay" : "Play"}</button>
        <button type="button" className="btn" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} aria-label="Previous line" data-testid="vault-prev">‹</button>
        <button type="button" className="btn" onClick={() => setI((x) => Math.min(n - 1, x + 1))} disabled={i >= n - 1} aria-label="Next line" data-testid="vault-next">›</button>
        <input type="range" min={0} max={n - 1} value={i} onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }} aria-label="Position in the logs" data-testid="vault-scrub" />
        <span className="home-dim" data-testid="vault-when">{when(cur.at)} · {i + 1}/{n}</span>
      </div>
      <ol className="vault-lines" ref={tail} aria-live="off" data-testid="vault-lines">
        {shown.map((e) => <li key={e.id} data-testid="vault-line"><span className="home-dim">{e.author} · #{e.channel}</span><span>{e.text}</span></li>)}
      </ol>
    </div>
  );
}
