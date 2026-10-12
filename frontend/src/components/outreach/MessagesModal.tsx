import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { oxDownload } from "../../lib/outreachSession";
import type { BlockType, Contact, ImportReport, MsgFull, MsgRow } from "./types";

const HINT: Record<string, string> = { decline: "reads like a decline", acceptance: "reads like an acceptance", confirmation: "receipt confirmation" };
const day = (iso: string): string => iso.slice(0, 10);

/** Past mail: what was sent from here and what was read from .eml files. Select text in a message to keep it as a block. */
export function MessagesModal({ blockTypes, contacts, onBlocks, onImported, onStatus, onClose }: {
  blockTypes: BlockType[]; contacts: Contact[]; onBlocks: (t: BlockType[]) => void; onImported: () => void; onStatus: (id: number, status: string) => void; onClose: () => void;
}) {
  const [kind, setKind] = useState<"application" | "stray" | "all">("application");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<MsgRow[] | null>(null);
  const [open, setOpen] = useState<MsgFull | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<{ text: string; type: string; title: string } | null>(null);
  const body = useRef<HTMLPreElement>(null); const file = useRef<HTMLInputElement>(null);

  const load = () => api<MsgRow[]>(`/api/outreach/messages?kind=${kind}&q=${encodeURIComponent(q)}`).then(setRows).catch((e) => setErr(e instanceof Error ? e.message : "Couldn't load."));
  useEffect(() => { const t = setTimeout(() => { void load(); }, q ? 300 : 0); return () => clearTimeout(t); }, [kind, q]); // eslint-disable-line react-hooks/exhaustive-deps

  async function show(k: string) { setPick(null); setErr(""); try { setOpen(await api<MsgFull>(`/api/outreach/messages/${k}`)); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't open."); } }
  async function importFiles(list: FileList | null) {
    if (!list?.length) return; setBusy(true); setErr(""); setReport(null);
    try { const fd = new FormData(); for (const f of Array.from(list)) fd.append("file", f); setReport(await api<ImportReport>("/api/outreach/eml/import", { method: "POST", body: fd })); onImported(); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Import failed."); }
    setBusy(false); if (file.current) file.current.value = "";
  }
  async function exportOne() { if (!open) return; setErr(""); try { await oxDownload("/api/outreach/eml/export", { keys: [open.key] }, "mail.eml"); } catch (e) { setErr(e instanceof Error ? e.message : "Export failed."); } }
  async function exportAll() { setErr(""); try { await oxDownload("/api/outreach/eml/export", { all: true }, "outreach-mail.zip"); } catch (e) { setErr(e instanceof Error ? e.message : "Export failed."); } }
  async function resort(to: "application" | "stray") { if (!open) return; try { await api(`/api/outreach/messages/${open.key}`, { method: "PATCH", body: JSON.stringify({ kind: to }) }); setOpen({ ...open, kind: to }); onImported(); await load(); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't re-sort."); } }

  // selecting text inside the message offers to keep it as a block
  function onSelect() {
    const sel = window.getSelection(); const t = sel?.toString().trim() ?? "";
    if (!t || !body.current || !sel?.anchorNode || !body.current.contains(sel.anchorNode)) return;
    setPick((p) => ({ text: t.slice(0, 20000), type: p?.type ?? (blockTypes[0] ? String(blockTypes[0].id) : "new"), title: p?.title ?? t.split(/\s+/).slice(0, 6).join(" ").slice(0, 60) }));
  }
  async function saveBlock() {
    if (!pick) return; setErr("");
    try {
      let typeId = Number(pick.type), types = blockTypes;
      if (pick.type === "new") { const name = prompt("Name the new kind of block (Short bio, Pitch line…)")?.trim(); if (!name) return; const t = await api<BlockType>("/api/outreach/block-types", { method: "POST", body: JSON.stringify({ name }) }); types = [...types, { ...t, blocks: [] }]; typeId = t.id; }
      const b = await api<{ id: number; typeId: number; title: string; body: string }>("/api/outreach/blocks", { method: "POST", body: JSON.stringify({ typeId, title: pick.title || "From a mail", body: pick.text }) });
      onBlocks(types.map((t) => (t.id === typeId ? { ...t, blocks: [...t.blocks, b] } : t))); setPick(null); window.getSelection()?.removeAllRanges();
      setReport(null); setErr(""); setOpenNote(`Saved as a block: “${b.title}”.`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save the block."); }
  }
  const [note, setOpenNote] = useState("");
  const contact = open?.contactId ? contacts.find((c) => c.id === open.contactId) : null;

  return (
    <div className="ox-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ox-modal ox-xwide" role="dialog" aria-label="Past mail">
        <header><h2>Past mail</h2><button className="btn" onClick={onClose} aria-label="Close">✕</button></header>
        <div className="ox-bar">
          <button className="btn btn-primary" onClick={() => file.current?.click()} disabled={busy} title="One or many .eml files, or a .zip of them">{busy ? "Reading…" : "Import .eml / .zip"}</button>
          <input ref={file} type="file" multiple accept=".eml,.zip,message/rfc822,application/zip" hidden onChange={(e) => importFiles(e.target.files)} />
          <button className="btn" onClick={exportAll} title="Everything sent from here and everything imported, as .eml files in a zip">Export all (.zip)</button>
          <span className="ox-spacer" />
          <input className="ox-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search mail…" aria-label="Search mail" />
          {(["application", "stray", "all"] as const).map((k) => <button key={k} className={"btn" + (kind === k ? " active" : "")} onClick={() => setKind(k)} aria-pressed={kind === k}>{{ application: "The process", stray: "Stray", all: "All" }[k]}</button>)}
        </div>
        {report && (
          <div className={report.failed.length ? "ox-warn" : "ox-ok"} role="status">
            <p>Read {report.files} file{report.files === 1 ? "" : "s"}: {report.imported} added{report.duplicates ? `, ${report.duplicates} already known` : ""}. {report.strays} looked unrelated to applications and were kept apart under <b>Stray</b>. {report.newContacts} new contact{report.newContacts === 1 ? "" : "s"}, {report.updatedContacts} updated with dates and counts.</p>
            {report.suggestions.length > 0 && <ul>{report.suggestions.map((s, i) => <li key={i}>{s.who}: “{s.subject}” {s.hint === "decline" ? "reads like a decline" : "reads like an acceptance"} <button className="btn-link" onClick={() => onStatus(s.contactId, s.hint === "decline" ? "declined" : "accepted")}>mark {s.hint === "decline" ? "declined" : "accepted"}</button></li>)}</ul>}
            {report.failed.map((f) => <p key={f.name}>{f.name}: {f.error}</p>)}
          </div>
        )}
        {err && <p className="ox-err" role="alert">{err}</p>}{note && <p className="ox-ok" role="status">{note}</p>}
        <div className="ox-mail">
          <ul className="ox-mail-list" aria-label="Messages">
            {!rows ? <li className="ox-dim">Loading…</li> : rows.length === 0 ? <li className="ox-dim">{kind === "stray" ? "No stray mail." : "No mail yet. Import .eml files (in Thunderbird, Apple Mail or Gmail: drag a message to the desktop) or a zip of them."}</li> : rows.map((r) => (
              <li key={r.key}><button className={"ox-mail-row" + (open?.key === r.key ? " on" : "")} onClick={() => show(r.key)}>
                <span><b>{r.direction === "out" ? "→ " : "← "}{r.who}</b> <small className="ox-dim">{day(r.date)}</small></span>
                <span>{r.subject || "(no subject)"}</span><small className="ox-dim">{r.snippet}</small>
                {r.hint && <em className="ox-tag">{HINT[r.hint]}</em>}{r.kind === "stray" && <em className="ox-tag">stray</em>}
              </button></li>))}
          </ul>
          <article className="ox-mail-view" aria-label="Message">
            {!open ? <p className="ox-dim">Open a message. Select any part of its text to keep it as a block.</p> : (
              <>
                <h3>{open.subject || "(no subject)"}</h3>
                <p className="ox-dim">{open.direction === "out" ? "To" : "From"}: {open.direction === "out" ? open.to : open.from} · {open.date.slice(0, 16).replace("T", " ")}{contact ? ` · ${contact.name || contact.email}` : ""}</p>
                {open.reason && <p className="ox-hint">{open.reason}</p>}
                {open.attachments.length > 0 && <p className="ox-dim">Attachments (not stored): {open.attachments.map((a) => a.name).join(", ")}</p>}
                <pre ref={body} className="ox-mail-body" onMouseUp={onSelect} onKeyUp={onSelect} tabIndex={0}>{open.body || "(empty)"}</pre>
                {pick && (
                  <div className="ox-pickbar" role="group" aria-label="Keep the selection as a block">
                    <b>“{pick.text.length > 60 ? `${pick.text.slice(0, 60)}…` : pick.text}”</b>
                    <select value={pick.type} onChange={(e) => setPick({ ...pick, type: e.target.value })} aria-label="Kind of block">{blockTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="new">＋ New kind…</option></select>
                    <input value={pick.title} onChange={(e) => setPick({ ...pick, title: e.target.value })} placeholder="Block title" aria-label="Block title" />
                    <button className="btn btn-primary" onClick={saveBlock}>Add as block</button><button className="btn" onClick={() => setPick(null)}>✕</button>
                  </div>
                )}
                <div className="ox-bar">
                  <button className="btn" onClick={exportOne}>Export .eml</button>
                  {open.key[0] === "m" && (open.kind === "stray" ? <button className="btn" onClick={() => resort("application")}>This belongs to the process</button> : <button className="btn" onClick={() => resort("stray")}>This is unrelated (stray)</button>)}
                </div>
              </>
            )}
          </article>
        </div>
      </div>
    </div>
  );
}
