import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useDocumentTitle } from "../../lib/useDocumentTitle";

interface Item { kind: "join" | "submission" | "reward"; id: number; title: string; who: string; at: number; to: string }
interface Inbox { total: number; counts: Record<string, number>; items: Item[] }
const LABEL = { join: "Join request", submission: "Submission", reward: "Reward claim" } as const;

export function ago(ms: number, now = Date.now()): string {
  const m = Math.max(0, Math.floor((now - ms) / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

export function InboxAdminPage() {
  useDocumentTitle("Inbox");
  const [d, setD] = useState<Inbox | null>(null);
  const [only, setOnly] = useState<string>("all");
  useEffect(() => { api<Inbox>("/api/admin/inbox").then((x) => setD(x && Array.isArray(x.items) ? x : { total: 0, counts: {}, items: [] })).catch(() => setD({ total: 0, counts: {}, items: [] })); }, []);
  const items = (d?.items ?? []).filter((i) => only === "all" || i.kind === only);

  return (
    <div data-testid="inbox-page">
      <h1>Inbox</h1>
      <p className="home-dim" style={{ fontSize: "0.85rem" }}>Everything waiting on someone, longest wait first.</p>
      {d && (
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.8rem" }}>
          <button className={`btn${only === "all" ? " btn-primary" : ""}`} onClick={() => setOnly("all")}>All · {d.total}</button>
          {(Object.keys(LABEL) as (keyof typeof LABEL)[]).map((k) => <button key={k} className={`btn${only === k ? " btn-primary" : ""}`} onClick={() => setOnly(k)} data-testid={`inbox-filter-${k}`}>{LABEL[k]} · {d.counts[k] ?? 0}</button>)}
        </div>
      )}
      {!d ? <p className="home-dim">Loading…</p> : items.length === 0 ? <p className="home-dim" data-testid="inbox-empty">Nothing is waiting.</p> : (
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          {items.map((i) => (
            <li key={`${i.kind}-${i.id}`} data-testid="inbox-item" style={{ display: "flex", gap: "0.7rem", alignItems: "baseline", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.4rem 0.6rem" }}>
              <span className="mono" style={{ fontSize: "0.75rem", minWidth: 90 }}>{LABEL[i.kind]}</span>
              <span style={{ flex: 1, minWidth: 0 }}><b>{i.who}</b> <span className="home-dim">{i.title}</span></span>
              <span className="home-dim" style={{ fontSize: "0.8rem" }}>{ago(i.at)}</span>
              <Link className="btn" to={i.to}>Open</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
