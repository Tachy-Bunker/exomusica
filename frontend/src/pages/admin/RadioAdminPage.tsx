import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useDocumentTitle } from "../../lib/useDocumentTitle";

interface Block { id: number; startHour: number; hours: number; branch: { slug: string; name: string } }
interface BranchLite { id: number; name: string }
const pad = (n: number) => String(n).padStart(2, "0");

export function RadioAdminPage() {
  useDocumentTitle("Radio schedule");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [branchId, setBranchId] = useState(0);
  const [startHour, setStartHour] = useState(0);
  const [hours, setHours] = useState(3);
  const [err, setErr] = useState("");
  const load = () => api<Block[]>("/api/admin/radio").then((b) => setBlocks(Array.isArray(b) ? b : [])).catch(() => {});
  useEffect(() => { void load(); api<BranchLite[]>("/api/admin/branches").then((b) => { if (Array.isArray(b)) { setBranches(b); setBranchId(b[0]?.id ?? 0); } }).catch(() => {}); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    try { await api("/api/admin/radio", { method: "POST", body: JSON.stringify({ branchId, startHour, hours }) }); void load(); }
    catch (x) { setErr(x instanceof Error ? x.message : "Couldn't add it"); }
  }
  async function remove(id: number) { await api(`/api/admin/radio/${id}`, { method: "DELETE" }); void load(); }

  return (
    <div data-testid="radio-admin">
      <h1>Radio schedule</h1>
      <p className="home-dim" style={{ fontSize: "0.85rem" }}>Hours are UTC. Any hour without a block rotates through the branches that have music, three hours at a time. Branches with no playable tracks are skipped.</p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {blocks.map((b) => (
          <li key={b.id} data-testid="radio-block" style={{ display: "flex", gap: "0.6rem", alignItems: "center", marginBottom: "0.3rem" }}>
            <span className="mono">{pad(b.startHour)}:00 → {pad((b.startHour + b.hours) % 24)}:00</span> <b>{b.branch.name}</b>
            <button className="btn" onClick={() => remove(b.id)} aria-label={`Remove ${b.branch.name} block`}>✕</button>
          </li>
        ))}
        {blocks.length === 0 && <li className="home-dim">No blocks: the day rotates automatically.</li>}
      </ul>
      <form onSubmit={add} style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
        <select value={branchId} onChange={(e) => setBranchId(Number(e.target.value))} aria-label="Branch">{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        from <input type="number" min={0} max={23} value={startHour} onChange={(e) => setStartHour(Number(e.target.value))} aria-label="Start hour" style={{ width: 70 }} />
        for <input type="number" min={1} max={24} value={hours} onChange={(e) => setHours(Number(e.target.value))} aria-label="Hours" style={{ width: 70 }} /> h
        <button className="btn" type="submit" disabled={!branchId}>Add block</button>
      </form>
      {err && <p role="alert" style={{ color: "var(--accent-danger)" }}>{err}</p>}
    </div>
  );
}
