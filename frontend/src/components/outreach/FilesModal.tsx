import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import type { AttachRule, FileItem, Group } from "./types";

type FileGroup = { id: number; name: string };
const size = (n: number): string => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);
const ICON: Record<string, string> = { audio: "🎵", file: "📄", image: "🖼" };

/** The workspace's uploaded files, in groups, to use again. "pick" inserts into the message; "manage" is the housekeeping view. */
export function FilesModal({ mode, groups, attachRules, onAttachRules, onPick, onClose }: {
  mode: "pick" | "manage"; groups: Group[]; attachRules?: AttachRule[]; onAttachRules?: (r: AttachRule[]) => void; onPick?: (f: FileItem[]) => void; onClose: () => void;
}) {
  const [files, setFiles] = useState<FileItem[] | null>(null);
  const [fg, setFg] = useState<FileGroup[]>([]);
  const [cur, setCur] = useState<number | "all" | "none">("all");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const load = () => api<{ files: FileItem[]; groups: FileGroup[] }>("/api/outreach/files").then((r) => { setFiles(r.files); setFg(r.groups); }).catch((e) => setErr(e instanceof Error ? e.message : "Couldn't load."));
  useEffect(() => { void load(); }, []);

  const shown = useMemo(() => (files ?? []).filter((f) => (cur === "all" || (cur === "none" ? f.groupId === null : f.groupId === cur)) && (!q.trim() || f.name.toLowerCase().includes(q.trim().toLowerCase()))), [files, cur, q]);
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function upload(list: FileList | null) {
    if (!list?.length) return; setBusy(true); setErr("");
    try { for (const f of Array.from(list)) { const fd = new FormData(); fd.append("file", f); await api(`/api/outreach/files${typeof cur === "number" ? `?group=${cur}` : ""}`, { method: "POST", body: fd }); } await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Upload failed."); }
    setBusy(false); if (input.current) input.current.value = "";
  }
  async function newGroup() { const name = prompt("Name the file group (press photos, stereo masters…)")?.trim(); if (!name) return; try { const g = await api<FileGroup>("/api/outreach/file-groups", { method: "POST", body: JSON.stringify({ name }) }); setFg([...fg, g]); setCur(g.id); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't add."); } }
  async function renameGroup(g: FileGroup) { const name = prompt("Rename the group", g.name)?.trim(); if (!name || name === g.name) return; try { await api(`/api/outreach/file-groups/${g.id}`, { method: "PATCH", body: JSON.stringify({ name }) }); setFg(fg.map((x) => (x.id === g.id ? { ...x, name } : x))); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't rename."); } }
  async function dropGroup(g: FileGroup) { if (!confirm(`Delete the group “${g.name}”? Its files stay, ungrouped.`)) return; await api(`/api/outreach/file-groups/${g.id}`, { method: "DELETE" }).catch(() => null); setCur("all"); void load(); }
  async function move(to: string) { if (!sel.size || to === "") return; try { await api("/api/outreach/files/move", { method: "POST", body: JSON.stringify({ ids: [...sel], groupId: to === "none" ? null : Number(to) }) }); setSel(new Set()); void load(); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't move."); } }
  async function rename(f: FileItem) { const name = prompt("Rename the file", f.name)?.trim(); if (!name || name === f.name) return; await api(`/api/outreach/files/${f.id}`, { method: "PATCH", body: JSON.stringify({ name }) }).catch(() => null); void load(); }
  async function remove() { if (!sel.size || !confirm(`Remove ${sel.size} file${sel.size === 1 ? "" : "s"} from the library? Mail already sent keeps them.`)) return; for (const id of sel) await api(`/api/outreach/files/${id}`, { method: "DELETE" }).catch(() => null); setSel(new Set()); void load(); }
  async function autoAttach(f: FileItem, group: string) {
    if (!onAttachRules) return; const rest = (attachRules ?? []).filter((r) => r.fileId !== f.id);
    const next = group ? [...rest, { group: Number(group), fileId: f.id }] : rest;
    try { await api("/api/outreach/workspace", { method: "PUT", body: JSON.stringify({ attachRules: next }) }); onAttachRules(next); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save the rule."); }
  }

  return (
    <div className="ox-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ox-modal ox-wide" role="dialog" aria-label="File library">
        <header><h2>File library</h2><button className="btn" onClick={onClose} aria-label="Close">✕</button></header>
        <div className="ox-lib">
          <nav className="ox-lib-groups" aria-label="File groups">
            <button className={"btn" + (cur === "all" ? " btn-primary" : "")} onClick={() => setCur("all")}>All files {files ? `(${files.length})` : ""}</button>
            <button className={"btn" + (cur === "none" ? " btn-primary" : "")} onClick={() => setCur("none")}>Ungrouped</button>
            {fg.map((g) => <span key={g.id} className="ox-lib-g"><button className={"btn" + (cur === g.id ? " btn-primary" : "")} onClick={() => setCur(g.id)}>{g.name}</button>{cur === g.id && <><button className="btn-link" onClick={() => renameGroup(g)}>rename</button><button className="btn-link" onClick={() => dropGroup(g)}>delete</button></>}</span>)}
            <button className="btn" onClick={newGroup}>＋ New group</button>
          </nav>
          <div className="ox-lib-main">
            <div className="ox-bar">
              <input className="ox-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files…" aria-label="Search files" />
              <button className="btn btn-primary" onClick={() => input.current?.click()} disabled={busy}>{busy ? "Uploading…" : `Upload${typeof cur === "number" ? " here" : ""}`}</button>
              <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
              {sel.size > 0 && <>
                <select className="btn" value="" aria-label="Move to group" onChange={(e) => move(e.target.value)}><option value="">Move {sel.size} to…</option><option value="none">Ungrouped</option>{fg.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
                <button className="btn" onClick={remove}>Remove</button>
                {mode === "pick" && <button className="btn btn-primary" onClick={() => onPick?.((files ?? []).filter((f) => sel.has(f.id)))}>Insert {sel.size}</button>}
              </>}
            </div>
            {err && <p className="ox-err" role="alert">{err}</p>}
            {!files ? <p className="ox-dim">Loading…</p> : shown.length === 0 ? <p className="ox-dim">{files.length === 0 ? "Nothing uploaded yet. Files you add in the composer land here too, so you never upload the same one twice." : "No file here."}</p> : (
              <ul className="ox-lib-grid">{shown.map((f) => {
                const rule = (attachRules ?? []).find((r) => r.fileId === f.id);
                return (
                  <li key={f.id} className={sel.has(f.id) ? "on" : ""}>
                    <label className="ox-lib-pick"><input type="checkbox" checked={sel.has(f.id)} onChange={() => toggle(f.id)} aria-label={`Select ${f.name}`} />
                      {f.kind === "image" ? <img src={f.url} alt="" loading="lazy" decoding="async" width={96} height={72} /> : <span className="ox-lib-ico" aria-hidden>{ICON[f.kind]}</span>}</label>
                    <div><button className="btn-link" onClick={() => rename(f)} title="Rename">{f.name}</button><small className="ox-dim"> {size(f.sizeBytes)} · {f.createdAt}</small>
                      {onAttachRules && groups.length > 0 && <label className="ox-small">Auto-attach for <select value={rule?.group ?? ""} onChange={(e) => autoAttach(f, e.target.value)} aria-label={`Auto-attach ${f.name} for group`}><option value="">nobody</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}
                    </div>
                  </li>
                );
              })}</ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
