import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { Avatar } from "../Avatar";
import { hostedPathFrom, imageFrom, shrinkImage } from "../../lib/imageResize";

export interface UserDetail {
  id: number; username: string; email: string | null; avatarUrl: string | null; bio: string | null;
  links: { label: string; url: string }[] | null; isAdmin: boolean; isGhost: boolean;
  frame?: string | null; tint?: string | null; storageLimitMb?: number; storageUsedMb?: number;
}

/**
 * An admin's view of one member's profile: every detail can be changed (moderation, or adding the picture they never did).
 * The picture can be chosen, dropped, or pasted (Ctrl+V while the picture box is focused: an image, or the address of a file already hosted here).
 */
export function UserEditor({ initial, selfId, onSaved, onClose }: { initial: UserDetail; selfId: number | undefined; onSaved: () => void; onClose: () => void }) {
  const [d, setD] = useState<UserDetail>(initial);
  const [password, setPassword] = useState("");
  const [clear, setClear] = useState({ frame: false, tint: false });
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const set = (p: Partial<UserDetail>) => setD((x) => ({ ...x, ...p }));
  const fail = (e: unknown, fallback: string) => setError(e instanceof Error ? e.message : fallback);

  async function sendPicture(blob: Blob) {
    setError(null); setNote(null); setBusy(true);
    try {
      const small = await shrinkImage(blob);
      const fd = new FormData(); fd.append("file", small, blob instanceof File && small === blob ? blob.name : `avatar.${small.type === "image/webp" ? "webp" : small.type === "image/png" ? "png" : "jpg"}`);
      const r = await api<{ avatarUrl: string }>(`/api/admin/users/${d.id}/avatar`, { method: "POST", body: fd });
      set({ avatarUrl: r.avatarUrl }); setNote("Picture saved"); onSaved();
    } catch (e) { fail(e, "Picture upload failed"); } finally { setBusy(false); }
  }
  async function setHosted(path: string) {
    setError(null); setNote(null);
    try { await api(`/api/admin/users/${d.id}`, { method: "PATCH", body: JSON.stringify({ avatarUrl: path }) }); set({ avatarUrl: path }); setNote("Picture saved"); onSaved(); }
    catch (e) { fail(e, "Couldn't use that picture"); }
  }
  async function removePicture() {
    setError(null); setNote(null);
    try { await api(`/api/admin/users/${d.id}`, { method: "PATCH", body: JSON.stringify({ avatarUrl: null }) }); set({ avatarUrl: null }); setNote("Picture removed"); onSaved(); }
    catch (e) { fail(e, "Couldn't remove it"); }
  }
  function onPaste(e: ClipboardEvent) {
    const img = imageFrom(e.clipboardData);
    if (img) { e.preventDefault(); void sendPicture(img); return; }
    const path = hostedPathFrom(e.clipboardData.getData("text/plain"));
    if (path) { e.preventDefault(); void setHosted(path); return; }
    setError("Nothing to paste: copy a picture, or the address of a file on this site (/uploads/…)");
  }
  function onDrop(e: DragEvent) { const img = imageFrom(e.dataTransfer); if (img) { e.preventDefault(); void sendPicture(img); } }
  async function pasteButton() {
    setError(null);
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) { const t = it.types.find((x) => x.startsWith("image/")); if (t) { void sendPicture(await it.getType(t)); return; } }
      const txt = await navigator.clipboard.readText(); const path = hostedPathFrom(txt);
      if (path) { void setHosted(path); return; }
      setError("The clipboard has no picture. Copy one, or click the box and press Ctrl+V");
    } catch { setError("Your browser wouldn't let me read the clipboard: click the box and press Ctrl+V instead"); }
  }

  const links = d.links ?? [];
  const updLink = (i: number, p: Partial<{ label: string; url: string }>) => set({ links: links.map((l, j) => (j === i ? { ...l, ...p } : l)) });

  async function save() {
    setError(null); setNote(null);
    const body: Record<string, unknown> = {};
    if (d.username !== initial.username) body.username = d.username;
    if (!d.isGhost && d.email !== initial.email) body.email = d.email;
    if ((d.bio ?? "") !== (initial.bio ?? "")) body.bio = d.bio ?? "";
    if (JSON.stringify(links) !== JSON.stringify(initial.links ?? [])) body.links = links;
    if (d.isAdmin !== initial.isAdmin) body.isAdmin = d.isAdmin;
    if (d.storageLimitMb !== initial.storageLimitMb && d.storageLimitMb !== undefined) body.storageLimitMb = d.storageLimitMb;
    if (password) body.password = password;
    if (clear.frame) body.clearFrame = true;
    if (clear.tint) body.clearTint = true;
    if (Object.keys(body).length === 0) { setNote("Nothing changed"); return; }
    setBusy(true);
    try { await api(`/api/admin/users/${d.id}`, { method: "PATCH", body: JSON.stringify(body) }); onSaved(); onClose(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Save failed"); } finally { setBusy(false); }
  }

  return (
    <div style={{ display: "flex", gap: "1rem", padding: "0.8rem", background: "var(--bg-elevated)", borderRadius: "var(--radius)", flexWrap: "wrap" }} data-testid="user-editor">
      <div style={{ textAlign: "center", width: "11rem" }}>
        <div tabIndex={0} role="group" aria-label="Profile picture: paste or drop an image here" data-testid="avatar-drop" onPaste={onPaste} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
          style={{ padding: "0.6rem", border: "1px dashed var(--border)", borderRadius: "var(--radius)", outlineOffset: 2 }}>
          <Avatar url={d.avatarUrl} size={96} />
          <p className="home-dim" style={{ fontSize: "0.7rem", margin: "0.4rem 0 0" }}>Click here, then Ctrl+V to paste a picture. Or drop one.</p>
        </div>
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden data-testid="avatar-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void sendPicture(f); e.target.value = ""; }} />
        <div style={{ display: "flex", gap: "0.3rem", justifyContent: "center", flexWrap: "wrap", marginTop: "0.4rem" }}>
          <button type="button" className="btn" style={{ fontSize: "0.75rem" }} onClick={() => file.current?.click()} disabled={busy}>Choose file</button>
          <button type="button" className="btn" style={{ fontSize: "0.75rem" }} onClick={() => void pasteButton()} disabled={busy} data-testid="avatar-paste">Paste</button>
          {d.avatarUrl && <button type="button" className="btn btn-danger" style={{ fontSize: "0.75rem" }} onClick={() => void removePicture()} data-testid="avatar-remove">Remove</button>}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: "16rem" }}>
        <div className="field"><label>Username</label><input value={d.username} onChange={(e) => set({ username: e.target.value })} aria-label="Username" /></div>
        {!d.isGhost && <div className="field"><label>Email</label><input type="email" value={d.email ?? ""} onChange={(e) => set({ email: e.target.value })} aria-label="Email" /></div>}
        <div className="field"><label>Bio</label><textarea rows={3} value={d.bio ?? ""} onChange={(e) => set({ bio: e.target.value })} aria-label="Bio" /></div>
        <div className="field">
          <label>Links</label>
          {links.map((l, i) => (
            <div key={i} style={{ display: "flex", gap: "0.3rem", marginBottom: "0.2rem" }}>
              <input placeholder="label" value={l.label} onChange={(e) => updLink(i, { label: e.target.value })} style={{ width: "35%" }} />
              <input placeholder="https://…" value={l.url} onChange={(e) => updLink(i, { url: e.target.value })} style={{ flex: 1 }} />
              <button type="button" className="btn" onClick={() => set({ links: links.filter((_, j) => j !== i) })} aria-label="Remove link">×</button>
            </div>
          ))}
          {links.length < 10 && <button type="button" className="btn" onClick={() => set({ links: [...links, { label: "", url: "" }] })}>Add link</button>}
        </div>
        {d.storageLimitMb !== undefined && (
          <div className="field"><label>Storage limit (MB) <span className="home-dim">· using {d.storageUsedMb ?? 0} MB</span></label>
            <input type="number" min={0} step={50} value={d.storageLimitMb} onChange={(e) => set({ storageLimitMb: Number(e.target.value) })} aria-label="Storage limit in MB" style={{ width: "8rem" }} /></div>
        )}
        {!d.isGhost && (
          <>
            <div className="field"><label>New password <span className="home-dim">· leave empty to keep theirs</span></label>
              <input type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="New password" placeholder="at least 8 characters" /></div>
            <label style={{ fontSize: "0.85rem", display: "block", marginBottom: "0.5rem" }}>
              <input type="checkbox" checked={d.isAdmin} disabled={d.id === selfId} onChange={(e) => set({ isAdmin: e.target.checked })} /> Admin {d.id === selfId && <span className="home-dim">(you can't remove your own)</span>}
            </label>
          </>
        )}
        {(d.frame || d.tint) && (
          <p style={{ fontSize: "0.85rem" }} data-testid="suit-moderation">
            Suit: {d.frame && <>wearing <code>{d.frame}</code> <label><input type="checkbox" checked={clear.frame} onChange={(e) => setClear((c) => ({ ...c, frame: e.target.checked }))} /> clear</label> </>}
            {d.tint && <>tint <code>{d.tint}</code> <label><input type="checkbox" checked={clear.tint} onChange={(e) => setClear((c) => ({ ...c, tint: e.target.checked }))} /> clear</label></>}
          </p>
        )}
        {error && <p role="alert" style={{ color: "var(--accent-danger)" }}>{error}</p>}
        {note && <p role="status" className="home-dim">{note}</p>}
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy} data-testid="user-save">Save</button>{" "}
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
