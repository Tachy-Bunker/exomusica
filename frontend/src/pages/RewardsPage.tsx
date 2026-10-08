import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";

interface Reward { id: number; title: string; description: string | null; cost: number; stock: number | null; perUser: number; itemId: number | null; itemTitle: string | null; mine: number }
interface Points { balance: number; entries: { id: number; points: number; reason: string; createdAt: string }[]; claims: { id: number; title: string; itemId: number | null; cost: number; status: string; note: string | null; createdAt: string }[] }
const STATUS: Record<string, string> = { pending: "waiting for the team", fulfilled: "done", refunded: "refunded" };

/** Contributor points: what you have, what earned them, and what they can buy. */
export function RewardsPage() {
  useDocumentTitle("Rewards");
  const { user } = useAuth();
  const [rewards, setRewards] = useState<Reward[] | null>(null);
  const [points, setPoints] = useState<Points | null>(null);
  const [msg, setMsg] = useState<{ id: number; text: string; ok: boolean; itemId?: number | null } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  function load() {
    api<Reward[]>("/api/rewards").then(setRewards).catch(() => setRewards([]));
    if (user) api<Points>("/api/account/points").then(setPoints).catch(() => {});
  }
  useEffect(load, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function claim(r: Reward) {
    setBusy(r.id); setMsg(null);
    try {
      const out = await api<{ opened: boolean; itemId: number | null }>(`/api/rewards/${r.id}/claim`, { method: "POST" });
      setMsg({ id: r.id, ok: true, itemId: out.opened ? out.itemId : null, text: out.opened ? "Unlocked. It is in Resources now." : "Claimed. The team will take care of it; you can follow it below." });
      load();
    } catch (e) { setMsg({ id: r.id, ok: false, text: e instanceof Error ? e.message : "Couldn't claim it" }); } finally { setBusy(null); }
  }
  const balance = points?.balance ?? null;

  return (
    <div className="rewards-page page-column" style={{ maxWidth: 820 }} data-testid="rewards-page">
      <h1>Rewards</h1>
      {user ? (
        <p className="rewards-balance" data-testid="points-balance"><b>{balance ?? "…"}</b> <span className="home-dim">contributor points</span></p>
      ) : <p className="home-dim"><Link to="/login">Log in</Link> to see your points.</p>}

      {rewards === null ? <p className="home-dim">Loading…</p> : rewards.length === 0 ? <p className="home-dim">Nothing to claim yet. The team adds rewards over time.</p> : (
        <ul className="rewards-list">
          {rewards.map((r) => {
            const out = r.stock !== null && r.stock <= 0;
            const had = r.mine >= r.perUser;
            const short = balance !== null && r.cost > balance;
            return (
              <li key={r.id} className="reward-card" data-testid="reward">
                <div className="reward-head"><b>{r.title}</b><span className="reward-cost">{r.cost} pts</span></div>
                {r.description && <p className="home-dim">{r.description}</p>}
                {r.itemId && <p className="home-dim">Opens the paid resource <Link to={`/resource/${r.itemId}`}>{r.itemTitle}</Link>.</p>}
                <div className="reward-foot">
                  {r.stock !== null && <span className="home-dim">{out ? "none left" : `${r.stock} left`}</span>}
                  <button className="btn btn-primary" disabled={!user || busy === r.id || out || had || short} onClick={() => void claim(r)} data-testid="claim">
                    {had ? "Claimed" : out ? "Gone" : short && balance !== null ? `${r.cost - balance} more points` : "Claim"}
                  </button>
                </div>
                {msg?.id === r.id && <p className={msg.ok ? "home-dim" : "an-err"} role={msg.ok ? "status" : "alert"}>{msg.text}{msg.itemId ? <> <Link to={`/resource/${msg.itemId}`}>Open it</Link></> : null}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {points && points.claims.length > 0 && (
        <>
          <h2 className="home-h2">Your claims</h2>
          <ul className="rewards-ledger" data-testid="claims">
            {points.claims.map((c) => <li key={c.id}><b>{c.title}</b> <span className="home-dim">{c.cost} pts · {STATUS[c.status] ?? c.status}{c.note ? ` · ${c.note}` : ""}</span></li>)}
          </ul>
        </>
      )}
      {points && (
        <>
          <h2 className="home-h2">Points history</h2>
          {points.entries.length === 0 ? <p className="home-dim">Nothing yet. Points are awarded for contributions the team accepts.</p> : (
            <ul className="rewards-ledger" data-testid="ledger">
              {points.entries.map((e) => <li key={e.id}><span className={e.points < 0 ? "pts neg" : "pts"}>{e.points > 0 ? "+" : ""}{e.points}</span> {e.reason} <span className="home-dim">{new Date(e.createdAt).toLocaleDateString()}</span></li>)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
