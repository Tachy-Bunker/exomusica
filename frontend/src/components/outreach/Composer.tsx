import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { applyMail, mediaLine, type MailKind } from "../../lib/mailEdit";
import { mergeFields, parseAddressList } from "../../lib/outreachSheet";
import { BlocksPanel } from "./BlocksPanel";
import type { BlockType, Col, Contact, HistoryRow, OutreachSettings, SendResult } from "./types";

const DRAFT_KEY = "exomusica_outreach_draft_v1";
interface Draft { subject: string; body: string; extraTo: string; cc: string; bcc: string; signature: boolean; followUp: string | null; followSet: boolean }
const EMPTY: Draft = { subject: "", body: "", extraTo: "", cc: "", bcc: "", signature: true, followUp: null, followSet: false };
function loadDraft(): Draft { try { return { ...EMPTY, ...(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}") as Partial<Draft>) }; } catch { return EMPTY; } }
const addDays = (from: string, n: number): string => { const d = new Date(`${from}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

interface Preview { html: string; text: string; subject: string; missing: string[]; warnings: string[]; attachments: { filename: string; kind: string; size: number | null }[]; sampleContact: boolean }
const kb = (n: number | null) => (n === null ? "" : n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);

const TOOLS: { kind: MailKind; label: string; title: string; cls?: string }[][] = [
  [{ kind: "bold", label: "B", title: "Bold (Ctrl+B)", cls: "b" }, { kind: "italic", label: "I", title: "Italic (Ctrl+I)", cls: "i" }, { kind: "underline", label: "U", title: "Underline (Ctrl+U)", cls: "u" }, { kind: "strike", label: "S", title: "Strikethrough", cls: "s" }, { kind: "highlight", label: "▒", title: "Highlight" }, { kind: "code", label: "</>", title: "Code" }, { kind: "sup", label: "x²", title: "Superscript" }, { kind: "sub", label: "x₂", title: "Subscript" }],
  [{ kind: "h1", label: "H1", title: "Big heading" }, { kind: "h2", label: "H2", title: "Heading" }, { kind: "h3", label: "H3", title: "Small heading" }],
  [{ kind: "ul", label: "• List", title: "Bulleted list" }, { kind: "ol", label: "1. List", title: "Numbered list" }, { kind: "quote", label: "❝", title: "Quote" }, { kind: "hr", label: "—", title: "Divider" }],
  [{ kind: "left", label: "⇤", title: "Align left" }, { kind: "center", label: "↔", title: "Centre" }, { kind: "right", label: "⇥", title: "Align right" }],
  [{ kind: "link", label: "Link", title: "Link (Ctrl+K)" }, { kind: "button", label: "Button", title: "Button link" }, { kind: "table", label: "Table", title: "Table" }],
];

export function Composer({ settings, columns, contacts, selected, setSelected, blockTypes, onBlockTypes, today, onSent, preselectTick }: {
  settings: OutreachSettings; columns: Col[]; contacts: Contact[]; selected: Set<number>; setSelected: (s: Set<number>) => void;
  blockTypes: BlockType[]; onBlockTypes: (t: BlockType[]) => void; today: string; onSent: () => void; preselectTick: number;
}) {
  const [d, setD] = useState<Draft>(() => { const x = loadDraft(); return { ...x, cc: x.cc || settings.defaultCc, bcc: x.bcc || settings.defaultBcc }; });
  const [pv, setPv] = useState<Preview | null>(null);
  const [pvAs, setPvAs] = useState<number | null>(null);
  const [busy, setBusy] = useState<"" | "send" | "test" | "file">("");
  const [err, setErr] = useState("");
  const [holes, setHoles] = useState<{ to: string; fields: string[] }[] | null>(null);
  const [result, setResult] = useState<(SendResult & { test: boolean }) | null>(null);
  const [imgWidth, setImgWidth] = useState("100%"), [imgAlign, setImgAlign] = useState("center");
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null), fileIn = useRef<HTMLInputElement>(null), root = useRef<HTMLElement>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  // the reminder starts at "N days from today" until you choose otherwise
  const followUp = d.followSet ? d.followUp : addDays(today, settings.followUpDays);
  useEffect(() => { const t = setTimeout(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* private window */ } }, 400); return () => clearTimeout(t); }, [d]);
  useEffect(() => { if (preselectTick) root.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [preselectTick]);

  const recipients = useMemo(() => contacts.filter((c) => selected.has(c.id)), [contacts, selected]);
  const withEmail = recipients.filter((c) => c.email);
  const extra = parseAddressList(d.extraTo);
  const total = withEmail.length + extra.length;
  const previewId = pvAs !== null && selected.has(pvAs) ? pvAs : recipients[0]?.id ?? null;

  // live preview: server-rendered, so what you see is what is sent. Debounced, and skipped while the message is empty.
  useEffect(() => {
    if (!d.body.trim() && !d.subject.trim()) { setPv(null); return; }
    let live = true;
    const t = setTimeout(() => {
      api<Preview>("/api/admin/outreach/preview", { method: "POST", body: JSON.stringify({ subject: d.subject, bodyMd: d.body, contactId: previewId, signature: d.signature }) })
        .then((r) => { if (live) setPv(r); }).catch(() => { /* keep the last good preview */ });
    }, 450);
    return () => { live = false; clearTimeout(t); };
  }, [d.body, d.subject, d.signature, previewId, settings.signatureMd]);

  const edit = useCallback((kind: MailKind, arg = "") => {
    const el = ta.current; if (!el) return;
    const r = applyMail(el.value, el.selectionStart, el.selectionEnd, kind, arg);
    setD((p) => ({ ...p, body: r.value }));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(r.start, r.end); });
  }, []);
  const getSel = useCallback(() => { const el = ta.current; return el ? el.value.slice(el.selectionStart, el.selectionEnd) : ""; }, []);
  function onKey(e: React.KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const m: Record<string, MailKind> = { b: "bold", i: "italic", u: "underline", k: "link" };
    const k = m[e.key.toLowerCase()]; if (k) { e.preventDefault(); edit(k); }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return; setBusy("file"); setErr("");
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData(); fd.append("file", f);
        const r = await api<{ url: string; filename: string; mimeType: string }>("/api/admin/outreach/files", { method: "POST", body: fd });
        edit("insert", mediaLine(r.url, r.filename, r.mimeType || f.type, { width: imgWidth === "100%" ? undefined : imgWidth, align: imgAlign }));
        await new Promise((res) => setTimeout(res, 30)); // let the textarea take the first line before the next one
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed."); }
    setBusy(""); if (fileIn.current) fileIn.current.value = "";
  }

  async function send(test: boolean, allowMissing = false) {
    setErr(""); setHoles(null); setResult(null);
    if (!test && total === 0) { setErr("Choose who to write to: tick contacts in the list above, or type an address."); return; }
    if (!test && !confirm(`Send this to ${total} ${total === 1 ? "person" : "people"}${d.bcc ? " (Bcc: " + d.bcc + ")" : ""}?`)) return;
    setBusy(test ? "test" : "send");
    try {
      const r = await api<SendResult>("/api/admin/outreach/send", { method: "POST", body: JSON.stringify({ subject: d.subject, bodyMd: d.body, contactIds: withEmail.map((c) => c.id), extraTo: d.extraTo, cc: d.cc, bcc: d.bcc, followUpAt: test ? null : followUp, test, signature: d.signature, allowMissing }) });
      setResult({ ...r, test }); if (!test) { onSent(); setHistory(null); }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setHoles((e.body as { missing?: { to: string; fields: string[] }[] })?.missing ?? []);
      else setErr(e instanceof Error ? e.message : "Sending failed.");
    }
    setBusy("");
  }

  async function loadHistory() { try { setHistory(await api<HistoryRow[]>("/api/admin/outreach/history?limit=40")); } catch { setHistory([]); } }
  const fields = useMemo(() => mergeFields(columns), [columns]);
  const noMail = !settings.smtpHost || !settings.hasPassword;

  return (
    <section className="ox-composer" ref={root} aria-label="Composer">
      <h2>Write</h2>
      {noMail && <p className="ox-warn">Mail isn't set up yet: open <b>Mail settings</b> (top right) and enter your server and password. You can write and preview meanwhile.</p>}
      <div className="ox-to">
        <span className="ox-lbl">To</span>
        <div className="ox-chips">
          {recipients.map((c) => (
            <span key={c.id} className={"ox-chip" + (c.email ? "" : " bad")} title={c.email || "no email address"}>
              {c.name || c.email || `#${c.id}`}<button onClick={() => { const s = new Set(selected); s.delete(c.id); setSelected(s); }} aria-label={`Remove ${c.name || c.email}`}>✕</button>
            </span>
          ))}
          <input className="ox-extra" value={d.extraTo} onChange={(e) => set("extraTo", e.target.value)} placeholder={recipients.length ? "+ other addresses" : "Tick contacts above, or type addresses"} aria-label="Other addresses" />
        </div>
      </div>
      <div className="ox-ccs">
        <label>Cc<input value={d.cc} onChange={(e) => set("cc", e.target.value)} /></label>
        <label>Bcc<input value={d.bcc} onChange={(e) => set("bcc", e.target.value)} /></label>
      </div>
      <input className="ox-subject" value={d.subject} onChange={(e) => set("subject", e.target.value)} placeholder="Subject (merge fields work here too)" aria-label="Subject" />
      <div className="ox-main">
        <div className="ox-editor">
          <div className="ox-toolbar" role="toolbar" aria-label="Formatting">
            {TOOLS.map((g, i) => <span key={i} className="ox-tg">{g.map((t) => <button key={t.kind} type="button" className={"btn " + (t.cls ?? "")} title={t.title} aria-label={t.title} onMouseDown={(e) => e.preventDefault()} onClick={() => edit(t.kind)}>{t.label}</button>)}</span>)}
            <span className="ox-tg">
              <label className="btn ox-colour" title="Text colour">A<input type="color" defaultValue="#c0392b" onChange={(e) => edit("color", e.target.value)} aria-label="Text colour" /></label>
              <select className="btn" aria-label="Text size" value="" onChange={(e) => { if (e.target.value) edit("size", e.target.value); }}><option value="">Size</option>{[12, 14, 18, 24, 32].map((n) => <option key={n} value={n}>{n}px</option>)}</select>
              <select className="btn" aria-label="Insert merge field" value="" onChange={(e) => { if (e.target.value) edit("field", e.target.value); }}><option value="">{"{{ }}"} Field</option>{fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select>
            </span>
            <span className="ox-tg">
              <button type="button" className="btn" onClick={() => fileIn.current?.click()} disabled={busy === "file"} title="Picture (shown in the mail), audio or any file (sent as attachments)">{busy === "file" ? "Uploading…" : "📎 Add file"}</button>
              <select className="btn" aria-label="Picture width" value={imgWidth} onChange={(e) => setImgWidth(e.target.value)}>{["100%", "75%", "50%", "33%"].map((w) => <option key={w}>{w}</option>)}</select>
              <select className="btn" aria-label="Picture alignment" value={imgAlign} onChange={(e) => setImgAlign(e.target.value)}><option>center</option><option>left</option><option>right</option></select>
              <input ref={fileIn} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
            </span>
          </div>
          <textarea ref={ta} className="ox-body" value={d.body} onChange={(e) => set("body", e.target.value)} onKeyDown={onKey} rows={16} placeholder={"Dear {{first_name|there}},\n\nI'm writing about …"} aria-label="Message" spellCheck />
          <label className="ox-check"><input type="checkbox" checked={d.signature} onChange={(e) => set("signature", e.target.checked)} /> Add my signature{!settings.signatureMd.trim() && <span className="ox-dim"> (none written yet: Mail settings)</span>}</label>
        </div>
        <BlocksPanel types={blockTypes} onTypes={onBlockTypes} onInsert={(b) => edit("insert", b)} getSelection={getSel} />
      </div>

      <div className="ox-preview">
        <div className="ox-pvhead">
          <h3>Preview</h3>
          {recipients.length > 1 && <label>as <select value={previewId ?? ""} onChange={(e) => setPvAs(Number(e.target.value))}>{recipients.map((c) => <option key={c.id} value={c.id}>{c.name || c.email}</option>)}</select></label>}
          {pv?.sampleContact && <span className="ox-dim">with sample data (no contact chosen)</span>}
        </div>
        {pv ? (
          <>
            <p className="ox-pvsubject"><b>{pv.subject || "(no subject)"}</b></p>
            {pv.missing.length > 0 && <p className="ox-warn">Empty for this contact: {pv.missing.map((m) => `{{${m}}}`).join(", ")}. Use {"{{field|fallback}}"} to give it a default.</p>}
            {pv.warnings.map((w, i) => <p key={i} className="ox-warn">{w}</p>)}
            <iframe className="ox-frame" title="Message preview" sandbox="" srcDoc={pv.html} />
            {pv.attachments.length > 0 && <p className="ox-atts">Attached: {pv.attachments.filter((a) => a.kind === "file").map((a) => `${a.filename} ${kb(a.size)}`).join(" · ") || "—"}{pv.attachments.some((a) => a.kind === "inline") ? ` · ${pv.attachments.filter((a) => a.kind === "inline").length} picture(s) in the body` : ""}</p>}
          </>
        ) : <p className="ox-dim">Start writing: the message appears here exactly as it will be sent.</p>}
      </div>

      <div className="ox-send">
        <div className="ox-follow">
          <span className="ox-lbl">Remind me to follow up</span>
          <input type="date" value={followUp ?? ""} min={today} onChange={(e) => setD((p) => ({ ...p, followUp: e.target.value || null, followSet: true }))} aria-label="Follow-up date" />
          {[["+3 d", 3], ["+1 wk", 7], ["+2 wk", 14], ["+1 mo", 30]].map(([l, n]) => <button key={l} className="btn" onClick={() => setD((p) => ({ ...p, followUp: addDays(today, Number(n)), followSet: true }))}>{l}</button>)}
          <button className="btn" onClick={() => setD((p) => ({ ...p, followUp: null, followSet: true }))}>No reminder</button>
        </div>
        <div className="ox-row">
          <button className="btn" onClick={() => send(true)} disabled={!!busy || noMail}>{busy === "test" ? "Sending test…" : "Send test to myself"}</button>
          <button className="btn btn-primary" onClick={() => send(false)} disabled={!!busy || noMail || !d.subject.trim() || !d.body.trim()}>{busy === "send" ? `Sending${total > 1 ? " (one every second or so)" : ""}…` : `Send to ${total || "…"}`}</button>
          <button className="btn" onClick={() => { if (confirm("Clear this draft?")) setD({ ...EMPTY, cc: settings.defaultCc, bcc: settings.defaultBcc }); }}>Clear draft</button>
        </div>
        {err && <p className="ox-err" role="alert">{err}</p>}
        {holes && (
          <div className="ox-warn" role="alert">
            <p>Some merge fields are empty for:</p>
            <ul>{holes.slice(0, 12).map((h) => <li key={h.to}>{h.to}: {h.fields.map((f) => `{{${f}}}`).join(", ")}</li>)}</ul>
            <div className="ox-row"><button className="btn btn-primary" onClick={() => send(false, true)}>Send anyway</button><button className="btn" onClick={() => setHoles(null)}>Go back and fix</button></div>
          </div>
        )}
        {result && (
          <div className={result.failed ? "ox-warn" : "ox-ok"} role="status">
            <p>{result.test ? "Test sent to your own address." : `Sent ${result.sent}${result.failed ? `, ${result.failed} failed` : ""}.`}{!result.test && result.followUpAt ? ` Reminder set for ${result.followUpAt}.` : ""}{result.skipped.length ? ` Skipped (no email): ${result.skipped.join(", ")}.` : ""}</p>
            {result.results.filter((r) => !r.ok || r.error).map((r) => <p key={r.to}>{r.to}: {r.error}</p>)}
          </div>
        )}
      </div>

      <details className="ox-history" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && history === null) loadHistory(); }}>
        <summary>Sent from here</summary>
        {history === null ? <p className="ox-dim">Loading…</p> : history.length === 0 ? <p className="ox-dim">Nothing yet.</p> : (
          <ul>{history.map((h) => <li key={h.id} className={h.ok ? "" : "bad"}><time>{h.sentAt.slice(0, 16).replace("T", " ")}</time> <b>{h.to}</b> {h.subject}{h.note ? <em> — {h.note}</em> : null}</li>)}</ul>
        )}
      </details>
    </section>
  );
}
