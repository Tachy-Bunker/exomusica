import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { Loading } from "../../components/Loading";

interface Slot { slot: number; threshold: number; revealed: boolean; kind: string | null; key: string | null; title: string | null; text: string | null; imageUrl: string | null; notes: number[] | null; shownTitle: string; shownText: string; temp: boolean }
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/** The twelve Artifacts: pick each one by hand (its scannable's kind and key), write its text, and give it a picture and, if wanted, its own notes. */
export function ArtifactsAdminPage() {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Slot[]>("/api/admin/artifacts").then(setSlots).catch(() => setSlots([])); }, []);
  if (!slots) return <Loading />;
  const replace = (next: Slot) => setSlots((all) => (all ? all.map((x) => (x.slot === next.slot ? next : x)) : all));
  return (
    <div data-testid="artifacts-admin">
      <h2>Twelve Artifacts</h2>
      <p className="home-dim">Each Artifact opens when the community's scans pass its threshold. Pick the thing it is: a kind (lore, track, person or point) and its key, as the Probe names it (for example <code>album:slug</code>, <code>study:slug</code>, <code>wiki:slug</code>, <code>user:name</code>). Leave both empty for an Artifact with no scannable behind it. Leave the text empty to show the temporary one.</p>
      {error && <p role="alert" className="error">{error}</p>}
      {slots.map((s) => <SlotEditor key={s.slot} slot={s} onSaved={replace} onError={setError} />)}
    </div>
  );
}

function SlotEditor({ slot, onSaved, onError }: { slot: Slot; onSaved: (s: Slot) => void; onError: (e: string | null) => void }) {
  const [form, setForm] = useState({ kind: slot.kind ?? "", key: slot.key ?? "", title: slot.title ?? "", text: slot.text ?? "", notes: slot.notes ? slot.notes.join(", ") : "" });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    onError(null); setBusy(true); setSaved(false);
    const raw = form.notes.trim();
    const notes = raw === "" ? null : raw.split(/[\s,]+/).map(Number);
    try {
      const next = await api<Slot>(`/api/admin/artifacts/${slot.slot}`, { method: "PUT", body: JSON.stringify({ kind: form.kind || null, key: form.key.trim() || null, title: form.title.trim() || null, text: form.text.trim() || null, notes }) });
      onSaved(next); setSaved(true);
    } catch (e) { onError(e instanceof ApiError ? e.message : "Couldn't save"); }
    finally { setBusy(false); }
  }
  async function upload(file: File) {
    onError(null); setBusy(true);
    const fd = new FormData(); fd.append("file", file);
    try { onSaved(await api<Slot>(`/api/admin/artifacts/${slot.slot}/image`, { method: "POST", body: fd })); }
    catch (e) { onError(e instanceof ApiError ? e.message : "Upload failed"); }
    finally { setBusy(false); }
  }
  async function removeImage() {
    onError(null); setBusy(true);
    try { onSaved(await api<Slot>(`/api/admin/artifacts/${slot.slot}/image`, { method: "DELETE" })); }
    catch (e) { onError(e instanceof ApiError ? e.message : "Couldn't remove it"); }
    finally { setBusy(false); }
  }

  return (
    <fieldset data-testid={`artifact-admin-${slot.slot}`} style={{ margin: "0.8rem 0", padding: "0.6rem" }}>
      <legend><b>Artifact {ROMAN[slot.slot - 1]}</b> · {slot.revealed ? "open" : `opens at ${slot.threshold.toLocaleString()} scans`}{slot.temp && <span className="home-dim"> · temporary text in use</span>}</legend>
      <div style={{ display: "grid", gap: "0.4rem", gridTemplateColumns: "minmax(0,10rem) minmax(0,1fr)" }}>
        <label>Kind<br /><select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
          <option value="">none</option><option value="lore">lore</option><option value="track">track</option><option value="person">person</option><option value="point">point</option>
        </select></label>
        <label>Key<br /><input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="album:slug" style={{ width: "100%" }} /></label>
        <label style={{ gridColumn: "1 / -1" }}>Title<br /><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={80} style={{ width: "100%" }} placeholder={slot.shownTitle} /></label>
        <label style={{ gridColumn: "1 / -1" }}>Text<br /><textarea value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} maxLength={1200} rows={3} style={{ width: "100%" }} placeholder={slot.shownText} /></label>
        <label style={{ gridColumn: "1 / -1" }}>Notes (four frequencies in Hz, blank = derived from the key)<br /><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="262, 330, 392, 523" style={{ width: "100%" }} /></label>
        <div style={{ gridColumn: "1 / -1", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {slot.imageUrl && <img src={slot.imageUrl} alt="" style={{ width: "5rem", height: "3.75rem", objectFit: "cover" }} />}
          <label>Picture <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} /></label>
          {slot.imageUrl && <button type="button" className="btn" disabled={busy} onClick={() => void removeImage()}>Remove picture</button>}
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()} data-testid={`artifact-save-${slot.slot}`}>Save</button>
          {saved && <span role="status" className="home-dim">Saved</span>}
        </div>
      </div>
    </fieldset>
  );
}
