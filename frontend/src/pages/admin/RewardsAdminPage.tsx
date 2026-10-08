import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";

interface Reward { id: number; title: string; description: string | null; cost: number; perUser: number; stock: number | null; active: boolean; itemId: number | null; itemTitle: string | null; claimCount: number }
interface Claim { id: number; username: string; title: string; cost: number; status: string; note: string | null; createdAt: string }
interface Paid { id: number; title: string; paid: boolean }

function RewardRow({ r, onChanged }: { r: Reward; onChanged: () => void }) {
  const [cost, setCost] = useState(String(r.cost));
  const [stock, setStock] = useState(r.stock === null ? "" : String(r.stock));
  const [err, setErr] = useState<string | null>(null);
  async function patch(body: Record<string, unknown>) {
    setErr(null);
    try { await api(`/api/admin/rewards/${r.id}`, { method: "PATCH", body: JSON.stringify(body) }); onChanged(); } catch (e) { setErr(e instanceof ApiError ? e.message : "Couldn't save"); }
  }
  async function remove() {
    setErr(null);
    try { await api(`/api/admin/rewards/${r.id}`, { method: "DELETE" }); onChanged(); } catch (e) { setErr(e instanceof ApiError ? e.message : "Couldn't delete"); }
  }
  return (
    <li className={`reward-admin${r.active ? "" : " off"}`} data-testid="reward-admin">
      <div className="res-row">
        <b>{r.title}</b>
        {r.itemTitle && <span className="home-dim">opens: {r.itemTitle}</span>}
        <span className="home-dim">{r.claimCount} claimed</span>
        <label>cost <input type="number" min={1} value={cost} onChange={(e) => setCost(e.target.value)} onBlur={() => { if (cost !== String(r.cost)) void patch({ cost }); }} style={{ width: "5rem" }} aria-label={`Cost of ${r.title}`} /></label>
        <label>left <input type="number" min={0} value={stock} placeholder="∞" onChange={(e) => setStock(e.target.value)} onBlur={() => { if (stock !== (r.stock === null ? "" : String(r.stock))) void patch({ stock: stock === "" ? null : stock }); }} style={{ width: "5rem" }} aria-label={`Stock of ${r.title}`} /></label>
        <button className="btn" onClick={() => void patch({ active: !r.active })}>{r.active ? "Switch off" : "Switch on"}</button>
        <button className="btn btn-danger" onClick={() => void remove()}>Delete</button>
      </div>
      {r.description && <p className="home-dim">{r.description}</p>}
      {err && <p className="an-err" role="alert">{err}</p>}
    </li>
  );
}

/** What contributor points can buy, the queue of claims for the team to fulfil, and giving a resource to a member outright. */
export function RewardsAdminPage() {
  const [rewards, setRewards] = useState<Reward[] | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [paid, setPaid] = useState<Paid[]>([]);
  const [form, setForm] = useState({ title: "", description: "", cost: "", perUser: "1", stock: "", itemId: "" });
  const [error, setError] = useState<string | null>(null);
  const [grant, setGrant] = useState({ itemId: "", username: "" });
  const [grantMsg, setGrantMsg] = useState<string | null>(null);

  function load() {
    api<Reward[]>("/api/admin/rewards").then(setRewards).catch(() => setRewards([]));
    api<Claim[]>("/api/admin/reward-claims").then(setClaims).catch(() => {});
    api<Paid[]>("/api/admin/resources").then((l) => setPaid(l.filter((x) => x.paid))).catch(() => {});
  }
  useEffect(load, []);

  async function create(e: FormEvent) {
    e.preventDefault(); setError(null);
    try {
      await api("/api/admin/rewards", { method: "POST", body: JSON.stringify({ title: form.title, description: form.description || null, cost: form.cost, perUser: form.perUser, stock: form.stock === "" ? null : form.stock, itemId: form.itemId || null }) });
      setForm({ title: "", description: "", cost: "", perUser: "1", stock: "", itemId: "" });
      load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Couldn't create it"); }
  }
  async function resolve(c: Claim, status: "fulfilled" | "refunded") {
    const note = status === "refunded" ? undefined : window.prompt("A note for them (optional):") ?? undefined;
    await api(`/api/admin/reward-claims/${c.id}`, { method: "PATCH", body: JSON.stringify({ status, note }) }).catch(() => {});
    load();
  }
  async function doGrant(e: FormEvent) {
    e.preventDefault(); setGrantMsg(null);
    try { const r = await api<{ username: string }>(`/api/admin/resources/${grant.itemId}/grant`, { method: "POST", body: JSON.stringify({ username: grant.username }) }); setGrantMsg(`Given to ${r.username}.`); setGrant({ ...grant, username: "" }); }
    catch (err) { setGrantMsg(err instanceof ApiError ? err.message : "Couldn't give it"); }
  }
  const pending = claims.filter((c) => c.status === "pending");

  return (
    <div data-testid="rewards-admin" style={{ maxWidth: 860 }}>
      <h1>Rewards</h1>
      <p className="home-dim">What members can spend contributor points on. A reward linked to a paid resource opens it at once; any other reward waits below for you to fulfil by hand. Points themselves are awarded in "Contributor points".</p>

      <h2 className="home-h2">New reward</h2>
      <form onSubmit={create} className="res-coupon-form" data-testid="reward-form">
        <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Title (e.g. Early access to new packs)" aria-label="Title" />
        <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What they get" aria-label="Description" />
        <input type="number" min={1} value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} placeholder="Cost (points)" aria-label="Cost" style={{ width: "8rem" }} />
        <input type="number" min={1} value={form.perUser} onChange={(e) => setForm((f) => ({ ...f, perUser: e.target.value }))} placeholder="Per member" aria-label="Per member" style={{ width: "7rem" }} />
        <input type="number" min={0} value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))} placeholder="How many (blank = no limit)" aria-label="Stock" style={{ width: "11rem" }} />
        <select value={form.itemId} onChange={(e) => setForm((f) => ({ ...f, itemId: e.target.value }))} aria-label="Opens a resource">
          <option value="">Does not open a resource</option>
          {paid.map((p) => <option key={p.id} value={p.id}>Opens: {p.title}</option>)}
        </select>
        <button className="btn btn-primary" type="submit">Add reward</button>
      </form>
      {error && <p className="an-err" role="alert">{error}</p>}

      {rewards === null ? <p className="home-dim">Loading…</p> : rewards.length === 0 ? <p className="home-dim">No rewards yet.</p> : <ul className="res-list">{rewards.map((r) => <RewardRow key={r.id} r={r} onChanged={load} />)}</ul>}

      <h2 className="home-h2" style={{ marginTop: "1.6rem" }}>To fulfil ({pending.length})</h2>
      {pending.length === 0 ? <p className="home-dim">Nothing waiting.</p> : (
        <ul className="res-list" data-testid="claims-queue">
          {pending.map((c) => (
            <li key={c.id}><div className="res-row"><b>{c.username}</b> <span>{c.title}</span> <span className="home-dim">{c.cost} pts · {new Date(c.createdAt).toLocaleDateString()}</span>
              <button className="btn btn-primary" onClick={() => void resolve(c, "fulfilled")}>Done</button> <button className="btn" onClick={() => void resolve(c, "refunded")}>Refund points</button></div></li>
          ))}
        </ul>
      )}

      <h2 className="home-h2" style={{ marginTop: "1.6rem" }}>Give a resource to someone</h2>
      <form onSubmit={doGrant} className="res-coupon-form">
        <select value={grant.itemId} onChange={(e) => setGrant((g) => ({ ...g, itemId: e.target.value }))} aria-label="Resource" required>
          <option value="">- choose a paid resource -</option>
          {paid.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <input value={grant.username} onChange={(e) => setGrant((g) => ({ ...g, username: e.target.value }))} placeholder="Member's username" aria-label="Username" required />
        <button className="btn" type="submit">Give it</button>
      </form>
      {grantMsg && <p className="home-dim" role="status">{grantMsg}</p>}
    </div>
  );
}
