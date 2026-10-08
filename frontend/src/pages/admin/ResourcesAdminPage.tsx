import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { SeoFieldsEditor } from "../../components/SeoFieldsEditor";

interface Resource {
  id: number; title: string; description: string | null; owner: string; kind: string; cover: string | null;
  paid: boolean; price: string | null; payNote: string | null; paypalUrl: string | null;
  ogTitle: string | null; ogDescription: string | null; ogImageUrl: string | null;
  couponCount: number; unlockCount: number;
}
interface Coupon { id: number; code: string; itemId: number | null; itemTitle: string | null; note: string | null; maxUses: number | null; uses: number; expiresAt: string | null; active: boolean }

function ResourceEditor({ r, onSaved, onClose }: { r: Resource; onSaved: () => void; onClose: () => void }) {
  const [f, setF] = useState({ paid: r.paid, price: r.price ?? "", payNote: r.payNote ?? "", paypalUrl: r.paypalUrl ?? "", ogTitle: r.ogTitle ?? "", ogDescription: r.ogDescription ?? "", ogImageUrl: r.ogImageUrl ?? "" });
  const [msg, setMsg] = useState<string | null>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await api(`/api/admin/resources/${r.id}`, { method: "PATCH", body: JSON.stringify(f) });
      onSaved();
      setMsg("Saved.");
    } catch (err) { setMsg(err instanceof ApiError ? err.message : "Couldn't save"); }
  }
  return (
    <form onSubmit={save} className="res-edit" data-testid="res-edit">
      <label className="res-paid"><input type="checkbox" checked={f.paid} onChange={(e) => setF((x) => ({ ...x, paid: e.target.checked }))} /> Paid: the file is only given to people with a coupon code</label>
      {f.paid && (
        <>
          <div className="field"><label>Price (shown as typed)</label><input value={f.price} onChange={(e) => setF((x) => ({ ...x, price: e.target.value }))} placeholder="e.g. 5 USD" maxLength={60} /></div>
          <div className="field"><label>PayPal donation link <span className="home-dim">(blank = the site's Donate link)</span></label><input value={f.paypalUrl} onChange={(e) => setF((x) => ({ ...x, paypalUrl: e.target.value }))} placeholder="https://www.paypal.com/donate/?hosted_button_id=…" /></div>
          <div className="field"><label>How to pay <span className="home-dim">(shown on the card; blank = a standard sentence)</span></label><textarea rows={3} value={f.payNote} onChange={(e) => setF((x) => ({ ...x, payNote: e.target.value }))} placeholder="Use the PayPal donation button below, put the resource's name in the note, and you will be sent your code." /></div>
        </>
      )}
      <SeoFieldsEditor
        value={{ ogTitle: f.ogTitle, ogDescription: f.ogDescription, ogImageUrl: f.ogImageUrl }}
        onChange={(patch) => setF((x) => ({ ...x, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v ?? ""])) }))}
        page={{ title: r.title, body: r.description ?? "", images: r.cover ? [r.cover] : [], path: `/resource/${r.id}` }}
        defaultNote="Blank = the resource's title, description (and price when paid), tags and cover."
      />
      <p style={{ marginTop: "0.6rem" }}>
        <button className="btn btn-primary" type="submit">Save</button>{" "}
        <button className="btn" type="button" onClick={onClose}>Close</button>{" "}
        {msg && <span role="status" className="home-dim">{msg}</span>}
      </p>
    </form>
  );
}

export function ResourcesAdminPage() {
  const [items, setItems] = useState<Resource[] | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState({ code: "", itemId: "", note: "", maxUses: "", expiresAt: "" });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function load() {
    api<Resource[]>("/api/admin/resources").then(setItems).catch(() => setItems([]));
    api<Coupon[]>("/api/admin/resource-coupons").then(setCoupons).catch(() => {});
  }
  useEffect(load, []);

  async function createCoupon(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/admin/resource-coupons", { method: "POST", body: JSON.stringify({ code: form.code || undefined, itemId: form.itemId ? Number(form.itemId) : null, note: form.note || undefined, maxUses: form.maxUses ? Number(form.maxUses) : null, expiresAt: form.expiresAt || null }) });
      setForm({ code: "", itemId: form.itemId, note: "", maxUses: "", expiresAt: "" });
      load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Couldn't make the code"); }
  }
  async function toggle(c: Coupon) { await api(`/api/admin/resource-coupons/${c.id}`, { method: "PATCH", body: JSON.stringify({ active: !c.active }) }); load(); }
  async function remove(c: Coupon) { if (!confirm(`Delete the code ${c.code}?`)) return; await api(`/api/admin/resource-coupons/${c.id}`, { method: "DELETE" }); load(); }
  async function copy(code: string) { try { await navigator.clipboard.writeText(code); setCopied(code); window.setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500); } catch { /* the code is shown on screen */ } }

  const paidItems = (items ?? []).filter((i) => i.paid);
  return (
    <div data-testid="resources-admin">
      <h1>Resources</h1>
      <p className="home-dim">Mark a resource as paid to lock its file behind a coupon code. Make codes below and give them to the artists who contributed. Every resource also gets its own SEO, so a link to it previews well.</p>

      <h2 className="home-h2">Coupon codes</h2>
      <form onSubmit={createCoupon} className="res-coupon-form" data-testid="coupon-form">
        <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="Code (blank = make one)" aria-label="Code" />
        <select value={form.itemId} onChange={(e) => setForm((f) => ({ ...f, itemId: e.target.value }))} aria-label="Opens">
          <option value="">Opens every paid resource</option>
          {paidItems.map((i) => <option key={i.id} value={i.id}>Only: {i.title}</option>)}
        </select>
        <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="For (the artist's name)" aria-label="Note" />
        <input type="number" min={1} value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} placeholder="Uses (blank = no limit)" aria-label="Uses" style={{ width: "9rem" }} />
        <input type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} aria-label="Expires" title="Expires (blank = never)" />
        <button className="btn btn-primary" type="submit">Make code</button>
      </form>
      {error && <p className="an-err" role="alert">{error}</p>}
      {coupons.length === 0 ? <p className="home-dim">No codes yet.</p> : (
        <table>
          <thead><tr><th>Code</th><th>Opens</th><th>For</th><th>Used</th><th>Expires</th><th></th></tr></thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} style={{ opacity: c.active ? 1 : 0.5 }}>
                <td><button type="button" className="link-btn mono" onClick={() => void copy(c.code)} title="Copy the code">{c.code}</button>{copied === c.code && <span className="home-dim"> copied</span>}</td>
                <td>{c.itemTitle ?? "every paid resource"}</td>
                <td>{c.note ?? ""}</td>
                <td>{c.uses}{c.maxUses !== null ? ` / ${c.maxUses}` : ""}</td>
                <td>{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "never"}</td>
                <td><button className="btn" onClick={() => toggle(c)}>{c.active ? "Switch off" : "Switch on"}</button> <button className="btn btn-danger" onClick={() => remove(c)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="home-h2" style={{ marginTop: "1.6rem" }}>Resources</h2>
      {items === null ? <p className="home-dim">Loading…</p> : items.length === 0 ? <p className="home-dim">Nothing has been added in XenoLab yet.</p> : (
        <ul className="res-list">
          {items.map((r) => (
            <li key={r.id}>
              <div className="res-row">
                <b>{r.title}</b>
                <span className="home-dim">{r.owner} · {r.kind.toLowerCase()}</span>
                <span className={`res-badge${r.paid ? "" : " open"}`}>{r.paid ? `paid${r.price ? ` · ${r.price}` : ""}` : "free"}</span>
                {r.paid && <span className="home-dim">{r.unlockCount} unlocked</span>}
                <Link className="home-dim" to={`/resource/${r.id}`}>view</Link>
                <button className="btn" onClick={() => setEditing(editing === r.id ? null : r.id)} aria-expanded={editing === r.id}>{editing === r.id ? "Close" : "Price & SEO"}</button>
              </div>
              {editing === r.id && <ResourceEditor r={r} onSaved={load} onClose={() => setEditing(null)} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
