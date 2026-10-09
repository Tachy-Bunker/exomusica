import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { MONTHS, dateOfIndex, indexOfDate, layoutGraph } from "../../lib/stationCalendar";

interface N { id: number; title: string; body: string; mediaUrl: string | null; hint: string | null; hasAnswer: boolean; requires: number[]; quorum: number; opensOnDay: number | null; opensOn: string | null; rewardText: string | null; rewardUrl: string | null; rewardPoints: number; rewardItemId: number | null; published: boolean; solveCount: number }
interface Data { today: { index: number; label: string }; nodes: N[] }
const blank = { title: "", body: "", mediaUrl: "", hint: "", answer: "", removeAnswer: false, requires: [] as number[], quorum: "0", dated: false, cycle: "1", month: "0", day: "1", rewardText: "", rewardUrl: "", rewardPoints: "0", rewardItemId: "", published: false };
type Form = typeof blank;

function toForm(n: N): Form {
  const d = n.opensOnDay === null ? null : dateOfIndex(n.opensOnDay);
  return { title: n.title, body: n.body, mediaUrl: n.mediaUrl ?? "", hint: n.hint ?? "", answer: "", removeAnswer: false, requires: n.requires, quorum: String(n.quorum), dated: !!d, cycle: String(d?.cycle ?? 1), month: d?.month === null ? "null" : String(d?.month ?? 0), day: String(d?.day || 1), rewardText: n.rewardText ?? "", rewardUrl: n.rewardUrl ?? "", rewardPoints: String(n.rewardPoints), rewardItemId: n.rewardItemId ? String(n.rewardItemId) : "", published: n.published };
}

/** The puzzle graph: see its shape, edit a transmission, set its answer (stored salted and hashed, never shown again), its requirements, its date, its reward. */
export function SignalAdminPage() {
  const [data, setData] = useState<Data | null>(null);
  const [sel, setSel] = useState<number | "new" | null>(null);
  const [f, setF] = useState<Form>(blank);
  const [err, setErr] = useState<string | null>(null);
  const [test, setTest] = useState(""); const [testRes, setTestRes] = useState<string | null>(null);
  const load = () => api<Data>("/api/admin/signal").then(setData).catch(() => setData({ today: { index: 0, label: "" }, nodes: [] }));
  useEffect(() => { void load(); }, []);
  const nodes = data?.nodes ?? [];
  const pos = useMemo(() => layoutGraph(nodes.map((n) => ({ id: n.id, requires: n.requires, quorum: n.quorum, published: n.published, title: n.title }))), [nodes]);
  const cur = typeof sel === "number" ? nodes.find((n) => n.id === sel) : undefined;
  function pick(id: number | "new") { setSel(id); setErr(null); setTestRes(null); setTest(""); setF(id === "new" ? blank : toForm(nodes.find((n) => n.id === id)!)); }
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setErr(null);
    let opensOnDay: number | null = null;
    if (f.dated) { opensOnDay = indexOfDate(Number(f.cycle), f.month === "null" ? null : Number(f.month), Number(f.day)); if (opensOnDay === null) { setErr("That station date doesn't exist."); return; } }
    const body: Record<string, unknown> = {
      title: f.title, body: f.body, mediaUrl: f.mediaUrl.trim() || null, hint: f.hint, requires: f.requires, quorum: Number(f.quorum) || 0, opensOnDay,
      rewardText: f.rewardText, rewardUrl: f.rewardUrl.trim() || null, rewardPoints: Number(f.rewardPoints) || 0, rewardItemId: f.rewardItemId.trim() ? Number(f.rewardItemId) : null, published: f.published,
    };
    if (f.answer.trim()) body.answer = f.answer; else if (f.removeAnswer) body.answer = "";
    try {
      const n = sel === "new" ? await api<N>("/api/admin/signal", { method: "POST", body: JSON.stringify(body) }) : await api<N>(`/api/admin/signal/${sel}`, { method: "PATCH", body: JSON.stringify(body) });
      await load(); setSel(n.id); setF((p) => ({ ...p, answer: "", removeAnswer: false }));
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Couldn't save"); }
  }
  async function remove() {
    if (typeof sel !== "number" || !confirm("Delete this transmission? Things that required it stop requiring it.")) return;
    await api(`/api/admin/signal/${sel}`, { method: "DELETE" }).catch(() => {}); setSel(null); await load();
  }
  async function tryAnswer() { if (typeof sel !== "number") return; const r = await api<{ correct: boolean | null }>(`/api/admin/signal/${sel}/test`, { method: "POST", body: JSON.stringify({ answer: test }) }).catch(() => null); setTestRes(r === null ? "error" : r.correct === null ? "no answer set" : r.correct ? "correct" : "wrong"); }

  const maxX = Math.max(0, ...[...pos.values()].map((p) => p.x)) + 170, maxY = Math.max(0, ...[...pos.values()].map((p) => p.y)) + 56;
  return (
    <div data-testid="signal-admin" style={{ maxWidth: 980 }}>
      <h1>Signal</h1>
      <p className="home-dim">Station date: <b data-testid="sa-today">{data?.today.label}</b>. Players only ever see transmissions that are published, dated and unlocked for them.</p>
      <div className="sig-graph-wrap">
        <svg viewBox={`0 0 ${maxX} ${maxY}`} width={maxX} height={maxY} className="sig-graph" role="group" aria-label="Puzzle graph" data-testid="sig-graph">
          {nodes.flatMap((n) => n.requires.map((r) => { const a = pos.get(r), b = pos.get(n.id); return a && b ? <path key={`${r}-${n.id}`} d={`M${a.x + 150} ${a.y + 20}C${a.x + 175} ${a.y + 20} ${b.x - 25} ${b.y + 20} ${b.x} ${b.y + 20}`} className="sig-edge" /> : null; }))}
          {nodes.map((n) => { const p = pos.get(n.id)!; return (
            <g key={n.id} transform={`translate(${p.x} ${p.y})`} onClick={() => pick(n.id)} className={`sig-gnode${n.published ? "" : " draft"}${sel === n.id ? " on" : ""}`} role="button" tabIndex={0} aria-label={n.title} onKeyDown={(e) => { if (e.key === "Enter") pick(n.id); }} data-testid="sig-gnode">
              <rect width="150" height="40" rx="6" /><text x="8" y="17" className="sig-gt">{n.title.slice(0, 20)}</text>
              <text x="8" y="31" className="sig-gs">{n.quorum > 0 ? `lock ${n.solveCount}/${n.quorum}` : n.hasAnswer ? `${n.solveCount} solved` : `${n.solveCount} received`}{n.opensOn ? " · dated" : ""}</text>
            </g>); })}
        </svg>
      </div>
      <div className="xl-form-row"><button className="btn btn-primary" onClick={() => pick("new")} data-testid="sa-new">New transmission</button><Link className="btn" to="/admin/signal-studio" data-testid="sa-studio">Signal studio</Link><span className="home-dim">{nodes.length} in the graph</span></div>
      {sel !== null && (
        <div className="xl-form sig-edit" data-testid="sa-form">
          <input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Title" aria-label="Title" maxLength={120} />
          <textarea value={f.body} onChange={(e) => set("body", e.target.value)} rows={5} placeholder="The transmission: what players read" aria-label="Text" />
          <input value={f.mediaUrl} onChange={(e) => set("mediaUrl", e.target.value)} placeholder="Audio / image: https link or /uploads/… (WAV and FLAC are fine)" aria-label="Media" />
          <input value={f.answer} onChange={(e) => set("answer", e.target.value)} placeholder={cur?.hasAnswer ? "Answer is set. Type a new one to replace it" : "Answer (leave empty for a transmission with nothing to solve)"} aria-label="Answer" autoComplete="off" data-testid="sa-answer" />
          {cur?.hasAnswer && <label><input type="checkbox" checked={f.removeAnswer} onChange={(e) => set("removeAnswer", e.target.checked)} /> Remove the answer</label>}
          <input value={f.hint} onChange={(e) => set("hint", e.target.value)} placeholder="Hint (optional)" aria-label="Hint" />
          <fieldset className="sig-req"><legend>Requires (met before this one goes on the air)</legend>
            {nodes.filter((n) => n.id !== sel).map((n) => <label key={n.id}><input type="checkbox" checked={f.requires.includes(n.id)} onChange={(e) => set("requires", e.target.checked ? [...f.requires, n.id] : f.requires.filter((x) => x !== n.id))} /> {n.title}{n.quorum > 0 ? ` (lock ${n.quorum})` : ""}</label>)}
            {nodes.filter((n) => n.id !== sel).length === 0 && <span className="home-dim">Nothing else yet.</span>}
          </fieldset>
          <label>Collective lock <input type="number" min={0} value={f.quorum} onChange={(e) => set("quorum", e.target.value)} style={{ width: "6rem" }} aria-label="Quorum" data-testid="sa-quorum" /> <span className="home-dim">members must solve it before whatever requires it opens, for everyone. 0 = personal.</span></label>
          <div className="xl-form-row">
            <label><input type="checkbox" checked={f.dated} onChange={(e) => set("dated", e.target.checked)} /> Goes on the air on</label>
            <select value={f.month} disabled={!f.dated} onChange={(e) => set("month", e.target.value)} aria-label="Month">{MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}<option value="null">Null Day</option></select>
            <input type="number" min={1} max={28} value={f.day} disabled={!f.dated || f.month === "null"} onChange={(e) => set("day", e.target.value)} style={{ width: "4.5rem" }} aria-label="Day" />
            <span>Cycle</span><input type="number" min={1} value={f.cycle} disabled={!f.dated} onChange={(e) => set("cycle", e.target.value)} style={{ width: "4.5rem" }} aria-label="Cycle" />
          </div>
          <textarea value={f.rewardText} onChange={(e) => set("rewardText", e.target.value)} rows={2} placeholder="Reward text shown when solved (optional)" aria-label="Reward text" />
          <div className="xl-form-row">
            <input value={f.rewardUrl} onChange={(e) => set("rewardUrl", e.target.value)} placeholder="Reward link (https or /path)" aria-label="Reward link" style={{ flex: "1 1 200px" }} />
            <label>Points <input type="number" min={0} max={100} value={f.rewardPoints} onChange={(e) => set("rewardPoints", e.target.value)} style={{ width: "4.5rem" }} aria-label="Reward points" /></label>
            <label>Resource id <input value={f.rewardItemId} onChange={(e) => set("rewardItemId", e.target.value)} style={{ width: "5rem" }} aria-label="Resource to unlock" /></label>
          </div>
          <label><input type="checkbox" checked={f.published} onChange={(e) => set("published", e.target.checked)} data-testid="sa-published" /> On the air (published)</label>
          {err && <p className="an-err" role="alert" data-testid="sa-err">{err}</p>}
          <div className="xl-form-row">
            <button className="btn btn-primary" onClick={() => void save()} disabled={!f.title.trim() || !f.body.trim()} data-testid="sa-save">Save</button>
            {typeof sel === "number" && <button className="btn btn-danger" onClick={() => void remove()}>Delete</button>}
            {typeof sel === "number" && cur?.hasAnswer && <>
              <input value={test} onChange={(e) => setTest(e.target.value)} placeholder="Try an answer" aria-label="Try an answer" style={{ flex: "1 1 140px" }} /><button className="btn" onClick={() => void tryAnswer()}>Test</button>{testRes && <span data-testid="sa-testres">{testRes}</span>}
            </>}
          </div>
        </div>
      )}
    </div>
  );
}
