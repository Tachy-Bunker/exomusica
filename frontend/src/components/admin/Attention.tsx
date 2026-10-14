import { useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../../lib/api";

export interface AttItem { label: string; to: string; note?: string }
export interface AttPanel { kind: "todo" | "new" | "missing"; count: number; items: AttItem[] }
export interface Att { panels: Record<string, AttPanel>; total: number }
const EMPTY: Att = { panels: {}, total: 0 };
const NEW_PANELS = ["studies", "channels", "trash"];

/** The admin's red lights. Polled every 30 s while the tab is visible; opening a "new since" panel marks it as looked at. */
export function useAttention(pathname: string): Att {
  const [att, setAtt] = useState<Att>(EMPTY);
  const load = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    api<Att>("/api/admin/attention").then((a) => setAtt(a && a.panels ? a : EMPTY)).catch(() => undefined);
  }, []);
  useEffect(() => {
    const seg = pathname.match(/^\/admin\/([a-z-]+)/)?.[1];
    if (seg && NEW_PANELS.includes(seg)) api("/api/admin/attention/seen", { method: "POST", body: JSON.stringify({ panel: seg }) }).then(load).catch(() => undefined);
    else load();
  }, [pathname, load]);
  useEffect(() => { const id = window.setInterval(load, 30000); return () => window.clearInterval(id); }, [load]);
  return att;
}

export function AdminNavLink({ to, label, att }: { to: string; label: string; att: Att }) {
  const p = att.panels[to];
  return (
    <NavLink to={`/admin/${to}`} className={({ isActive }) => (isActive ? "active" : "")} style={p ? { display: "inline-flex", alignItems: "center", gap: "0.35rem" } : undefined}>
      {label}
      {p && <span className="admin-light" data-kind={p.kind} data-testid={`light-${to}`} title={LABEL[p.kind]}>{p.count > 99 ? "99+" : p.count}</span>}
    </NavLink>
  );
}

const LABEL = { todo: "waiting on you", new: "new since you last looked", missing: "incomplete" } as const;
const ORDER: AttPanel["kind"][] = ["todo", "new", "missing"];
const HEAD = { todo: "Waiting on you", new: "New since you last looked", missing: "Missing information" } as const;

export function AttentionPage() {
  const [att, setAtt] = useState<Att | null>(null);
  useEffect(() => { api<Att>("/api/admin/attention").then((a) => setAtt(a && a.panels ? a : EMPTY)).catch(() => setAtt(EMPTY)); }, []);
  if (!att) return <p className="home-dim">Looking…</p>;
  const panels = Object.entries(att.panels);
  return (
    <div data-testid="attention-page">
      <h1>Needs attention</h1>
      {panels.length === 0 && <p className="home-dim" data-testid="attention-clear">Nothing is waiting, new or incomplete.</p>}
      {ORDER.map((k) => {
        const rows = panels.filter(([, p]) => p.kind === k);
        if (rows.length === 0) return null;
        return (
          <section key={k} style={{ marginBottom: "1.2rem" }}>
            <h2 style={{ fontSize: "1.05rem" }}><span className="admin-light" data-kind={k}>{rows.reduce((n, [, p]) => n + p.count, 0)}</span> {HEAD[k]}</h2>
            {rows.map(([path, p]) => (
              <details key={path} open={k !== "missing"} data-testid={`att-${path}`}>
                <summary><NavLink to={`/admin/${path}`}>{path.replace(/-/g, " ")}</NavLink> · {p.count}</summary>
                <ul style={{ margin: "0.3rem 0 0.6rem" }}>
                  {p.items.map((it, i) => <li key={i}><NavLink to={it.to}>{it.label}</NavLink>{it.note && <span className="home-dim"> · {it.note}</span>}</li>)}
                  {p.count > p.items.length && <li className="home-dim">…and {p.count - p.items.length} more</li>}
                </ul>
              </details>
            ))}
          </section>
        );
      })}
    </div>
  );
}
