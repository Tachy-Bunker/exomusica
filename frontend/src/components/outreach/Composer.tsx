import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { applyMail, mediaLine, type MailKind } from "../../lib/mailEdit";
import { pasteEdit } from "../../lib/pasteMail";
import { mergeFields, parseAddressList } from "../../lib/outreachSheet";
import { DateInput } from "./Cells";
import { pitchChecks } from "../../lib/pitchCheck";
import { followUpDraft } from "../../lib/today";
import { BlocksPanel } from "./BlocksPanel";
import { ReviewModal, type ReviewRow } from "./ReviewModal";
import { VariantsPanel, blockTokens } from "./VariantsPanel";
import { FilesModal } from "./FilesModal";
import type { BlockType, Col, Contact, FileItem, Group, HistoryRow, OutreachSettings, Rule, Scheduled, SendResult, Stats, Template } from "./types";

const draftKey = (ws: number): string => `exomusica_outreach_draft_v2_${ws}`;
interface Later { on: boolean; date: string; time: string; theirZone: boolean; weekdays: boolean }
interface Draft { accountId: number | null; subjectB: string; abOn: boolean; subject: string; body: string; extraTo: string; cc: string; bcc: string; signature: boolean; followUp: string | null; followSet: boolean; rules: Rule[]; templateId: number | null; thread: boolean; plain: boolean; later: Later }
const EMPTY: Draft = { accountId: null, subjectB: "", abOn: false, subject: "", body: "", extraTo: "", cc: "", bcc: "", signature: true, followUp: null, followSet: false, rules: [], templateId: null, thread: false, plain: false, later: { on: false, date: "", time: "10:00", theirZone: true, weekdays: true } };
function loadDraft(ws: number): Draft { try { return { ...EMPTY, ...(JSON.parse(localStorage.getItem(draftKey(ws)) ?? "{}") as Partial<Draft>) }; } catch { return EMPTY; } }
const addDays = (from: string, n: number): string => { const d = new Date(`${from}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

interface Preview { used?: { kind: string; blockId: number }[]; html: string; text: string; subject: string; missing: string[]; warnings: string[]; attachments: { filename: string; kind: string; size: number | null }[]; sampleContact: boolean }
const kb = (n: number | null) => (n === null ? "" : n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);

const TOOLS: { kind: MailKind; label: string; title: string; cls?: string }[][] = [
  [{ kind: "bold", label: "B", title: "Bold (Ctrl+B)", cls: "b" }, { kind: "italic", label: "I", title: "Italic (Ctrl+I)", cls: "i" }, { kind: "underline", label: "U", title: "Underline (Ctrl+U)", cls: "u" }, { kind: "strike", label: "S", title: "Strikethrough", cls: "s" }, { kind: "highlight", label: "▒", title: "Highlight" }, { kind: "code", label: "</>", title: "Code" }, { kind: "sup", label: "x²", title: "Superscript" }, { kind: "sub", label: "x₂", title: "Subscript" }],
  [{ kind: "h1", label: "H1", title: "Big heading" }, { kind: "h2", label: "H2", title: "Heading" }, { kind: "h3", label: "H3", title: "Small heading" }],
  [{ kind: "ul", label: "• List", title: "Bulleted list" }, { kind: "ol", label: "1. List", title: "Numbered list" }, { kind: "quote", label: "❝", title: "Quote" }, { kind: "hr", label: "—", title: "Divider" }],
  [{ kind: "left", label: "⇤", title: "Align left" }, { kind: "center", label: "↔", title: "Centre" }, { kind: "right", label: "⇥", title: "Align right" }],
  [{ kind: "link", label: "Link", title: "Link (Ctrl+K)" }, { kind: "button", label: "Button", title: "Button link" }, { kind: "table", label: "Table", title: "Table" }],
];

export function Composer({ workspaceId, accounts, columns, contacts, groups, templates, onTemplates, scheduled, selected, setSelected, blockTypes, onBlockTypes, today, onSent, preselectTick, followUpReq }: {
  workspaceId: number; accounts: OutreachSettings[]; columns: Col[]; contacts: Contact[]; groups: Group[]; templates: Template[]; onTemplates: (t: Template[]) => void; scheduled: Scheduled[];
  selected: Set<number>; setSelected: (s: Set<number>) => void;
  blockTypes: BlockType[]; onBlockTypes: (t: BlockType[]) => void; today: string; onSent: () => void; preselectTick: number; followUpReq: { id: number; tick: number } | null;
}) {
  const [d, setD] = useState<Draft>(() => { const x = loadDraft(workspaceId); const a = accounts.find((y) => y.id === x.accountId) ?? accounts.find((y) => y.isDefault) ?? accounts[0]; return { ...x, accountId: a?.id ?? null, cc: x.cc || (a?.defaultCc ?? ""), bcc: x.bcc || (a?.defaultBcc ?? "") }; });
  const settings = accounts.find((y) => y.id === d.accountId) ?? accounts.find((y) => y.isDefault) ?? accounts[0];
  const [library, setLibrary] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pv, setPv] = useState<Preview | null>(null);
  const [pvAs, setPvAs] = useState<number | null>(null);
  const [busy, setBusy] = useState<"" | "send" | "test" | "file">("");
  const [err, setErr] = useState("");
  const [holes, setHoles] = useState<{ to: string; fields: string[] }[] | null>(null);
  const [result, setResult] = useState<(SendResult & { test: boolean }) | null>(null);
  const [review, setReview] = useState<ReviewRow[] | null>(null);
  const [note, setNote] = useState("");
  const [imgWidth, setImgWidth] = useState("100%"), [imgAlign, setImgAlign] = useState("center");
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null), fileIn = useRef<HTMLInputElement>(null), root = useRef<HTMLElement>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  function sendAs(id: number) {
    const next = accounts.find((a) => a.id === id); if (!next) return;
    setD((p) => ({ ...p, accountId: id, cc: p.cc === (settings?.defaultCc ?? "") ? next.defaultCc : p.cc, bcc: p.bcc === (settings?.defaultBcc ?? "") ? next.defaultBcc : p.bcc }));
  }
  useEffect(() => { if (d.later.on && !stats) api<Stats>("/api/outreach/stats").then(setStats).catch(() => {}); }, [d.later.on, stats]);

  // the reminder starts at "N days from today" until you choose otherwise
  const followUp = d.followSet ? d.followUp : addDays(today, settings?.followUpDays ?? 14);
  useEffect(() => { const t = setTimeout(() => { try { localStorage.setItem(draftKey(workspaceId), JSON.stringify(d)); } catch { /* private window */ } }, 400); return () => clearTimeout(t); }, [d]);
  useEffect(() => { if (preselectTick) root.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [preselectTick]);

  const recipients = useMemo(() => contacts.filter((c) => selected.has(c.id)), [contacts, selected]);
  const withEmail = recipients.filter((c) => c.email);
  const extra = parseAddressList(d.extraTo);
  const total = withEmail.length + extra.length;
  const template = templates.find((t) => t.id === d.templateId) ?? null;
  useEffect(() => {
    if (!followUpReq) return;
    let live = true;
    api<{ subject: string; bodyMd: string; sentAt: string }>(`/api/outreach/contacts/${followUpReq.id}/last-send`).then((prev) => {
      if (!live) return; const f = followUpDraft(prev);
      setD((p) => ({ ...p, subject: f.subject, body: f.body, thread: true, templateId: null, rules: [] })); setNote("Follow-up drafted from your earlier mail: it will thread under it. Edit freely.");
    }).catch(() => { if (live) setNote("Nothing was sent to them from here yet, so there is nothing to quote: write it fresh."); });
    return () => { live = false; };
  }, [followUpReq?.tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const previewId = pvAs !== null && selected.has(pvAs) ? pvAs : recipients[0]?.id ?? null;

  // live preview: server-rendered, so what you see is what is sent. Debounced, and skipped while the message is empty.
  useEffect(() => {
    if (!d.body.trim() && !d.subject.trim()) { setPv(null); return; }
    let live = true;
    const t = setTimeout(() => {
      api<Preview>("/api/outreach/preview", { method: "POST", body: JSON.stringify({ subject: d.subject, bodyMd: d.body, contactId: previewId, signature: d.signature, rules: d.rules, accountId: d.accountId }) })
        .then((r) => { if (live) setPv(r); }).catch(() => { /* keep the last good preview */ });
    }, 450);
    return () => { live = false; clearTimeout(t); };
  }, [d.body, d.subject, d.signature, d.rules, d.accountId, previewId, settings?.signatureMd, blockTypes]);

  const edit = useCallback((kind: MailKind, arg = "") => {
    const el = ta.current; if (!el) return;
    const r = applyMail(el.value, el.selectionStart, el.selectionEnd, kind, arg);
    setD((p) => ({ ...p, body: r.value }));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(r.start, r.end); });
  }, []);
  const getSel = useCallback(() => { const el = ta.current; return el ? el.value.slice(el.selectionStart, el.selectionEnd) : ""; }, []);
  /** Formatted text pasted in (Word, Docs, a web page, a mail) arrives as the composer's own markup; Ctrl+Shift+V still pastes plain. */
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget; const r = pasteEdit(e, el.value, el.selectionStart, el.selectionEnd); if (!r) return;
    e.preventDefault(); set("body", r.value); requestAnimationFrame(() => { el.focus(); el.setSelectionRange(r.start, r.end); });
  }
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
        const r = await api<{ url: string; filename: string; mimeType: string }>("/api/outreach/files", { method: "POST", body: fd });
        edit("insert", mediaLine(r.url, r.filename, r.mimeType || f.type, { width: imgWidth === "100%" ? undefined : imgWidth, align: imgAlign }));
        await new Promise((res) => setTimeout(res, 30)); // let the textarea take the first line before the next one
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed."); }
    setBusy(""); if (fileIn.current) fileIn.current.value = "";
  }

  const composeBody = (extra: object) => ({ accountId: d.accountId, subjectB: d.abOn ? d.subjectB : "", subject: d.subject, bodyMd: d.body, contactIds: withEmail.map((c) => c.id), extraTo: d.extraTo, cc: d.cc, bcc: d.bcc, signature: d.signature, rules: d.rules, templateName: template?.name ?? null, threadFollowUp: d.thread, plainOnly: d.plain, ...extra });
  async function openReview() {
    setErr(""); if (total === 0) { setErr("Choose who to write to: tick contacts in the list above, or type an address."); return; }
    try { setReview(await api<ReviewRow[]>("/api/outreach/review", { method: "POST", body: JSON.stringify(composeBody({})) })); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't review."); }
  }
  async function send(test: boolean, allowMissing = false) {
    setErr(""); setHoles(null); setResult(null); setReview(null);
    if (!test && total === 0) { setErr("Choose who to write to: tick contacts in the list above, or type an address."); return; }
    const later = !test && d.later.on;
    if (later && !d.later.date) { setErr("Choose the day to send."); return; }
    if (!test && !confirm(`${later ? "Schedule" : "Send"} this to ${total} ${total === 1 ? "person" : "people"}${d.bcc ? " (Bcc: " + d.bcc + ")" : ""}?`)) return;
    setBusy(test ? "test" : "send");
    try {
      const r = await api<SendResult>("/api/outreach/send", { method: "POST", body: JSON.stringify(composeBody({ followUpAt: test ? null : followUp, test, allowMissing, sendAt: later ? { date: d.later.date, time: d.later.time, recipientZone: d.later.theirZone, weekdays: d.later.weekdays, zone: Intl.DateTimeFormat().resolvedOptions().timeZone } : null })) });
      setResult({ ...r, test }); if (!test) { onSent(); setHistory(null); }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setHoles((e.body as { missing?: { to: string; fields: string[] }[] })?.missing ?? []);
      else setErr(e instanceof Error ? e.message : "Sending failed.");
    }
    setBusy("");
  }
  async function saveTemplate(asNew: boolean) {
    const name = asNew || !template ? prompt("Name this template", template?.name ?? "")?.trim() : template.name; if (!name) return;
    try {
      const body = JSON.stringify({ name, subject: d.subject, bodyMd: d.body, rules: d.rules });
      if (!asNew && template) { const t = await api<Template>(`/api/outreach/templates/${template.id}`, { method: "PATCH", body }); onTemplates(templates.map((x) => (x.id === t.id ? t : x))); setNote(`Template “${t.name}” updated.`); }
      else { const t = await api<Template>("/api/outreach/templates", { method: "POST", body }); onTemplates([...templates, t].sort((a, b) => a.name.localeCompare(b.name))); set("templateId", t.id); setNote(`Saved as “${t.name}”.`); }
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save the template."); }
  }
  async function deleteTemplate() {
    if (!template || !confirm(`Delete the template “${template.name}”?`)) return;
    await api(`/api/outreach/templates/${template.id}`, { method: "DELETE" }).catch(() => null); onTemplates(templates.filter((t) => t.id !== template.id)); set("templateId", null);
  }
  function loadTemplate(id: number | null) {
    const t = templates.find((x) => x.id === id); if (!t) { set("templateId", null); return; }
    if ((d.body.trim() || d.subject.trim()) && d.templateId !== t.id && !confirm("Replace the current subject and text with this template?")) return;
    setD((p) => ({ ...p, subject: t.subject, body: t.bodyMd, rules: t.rules, templateId: t.id, thread: false }));
  }
  async function cancelScheduled(id: number) { await api(`/api/outreach/scheduled/${id}`, { method: "DELETE" }).catch(() => null); onSent(); }

  async function loadHistory() { try { setHistory(await api<HistoryRow[]>("/api/outreach/history?limit=40")); } catch { setHistory([]); } }
  const fields = useMemo(() => mergeFields(columns), [columns]);
  const noMail = !settings || !settings.smtpHost || !settings.hasPassword;

  return (
    <section className="ox-composer" ref={root} aria-label="Composer">
      <h2>Write</h2>
      <div className="ox-tplbar">
        <select value={d.templateId ?? ""} onChange={(e) => loadTemplate(e.target.value ? Number(e.target.value) : null)} aria-label="Templates"><option value="">Templates…</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        {template && <button className="btn" onClick={() => saveTemplate(false)} title="Save the current subject, text and block choices into this template">Update “{template.name}”</button>}
        <button className="btn" onClick={() => saveTemplate(true)} disabled={!d.body.trim()}>Save as template…</button>
        {template && <button className="btn" onClick={deleteTemplate}>Delete</button>}
        {note && <span className="ox-dim" role="status">{note}</span>}
      </div>
      {noMail && <p className="ox-warn">Mail isn't set up yet: open <b>Mail settings</b> (top right) and enter your server and password. You can write and preview meanwhile.</p>}
      <div className="ox-from">
        <span className="ox-lbl">Send as</span>
        {accounts.length > 1
          ? <select value={d.accountId ?? ""} onChange={(e) => sendAs(Number(e.target.value))} aria-label="Send as">{accounts.map((a) => <option key={a.id} value={a.id}>{a.label || a.fromEmail || a.smtpUser || `Mailbox ${a.id}`}{a.fromEmail ? ` <${a.fromEmail}>` : ""}</option>)}</select>
          : <span>{settings?.fromName ? `${settings.fromName} ` : ""}<span className="ox-dim">{settings?.fromEmail || settings?.smtpUser || "no mailbox yet"}</span></span>}
      </div>
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
      <input className="ox-subject" value={d.subject} onChange={(e) => set("subject", e.target.value)} placeholder={d.abOn ? "Subject A (merge fields work here too)" : "Subject (merge fields work here too)"} aria-label="Subject" />
      {d.abOn && <input className="ox-subject" value={d.subjectB} onChange={(e) => set("subjectB", e.target.value)} placeholder="Subject B: every second person gets this one; Results compare the answers" aria-label="Subject B" />}
      <label className="ox-check"><input type="checkbox" checked={d.abOn} onChange={(e) => set("abOn", e.target.checked)} /> Compare two subject lines (A/B)</label>
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
              <button type="button" className="btn" onClick={() => setLibrary(true)} title="Your uploaded files, in groups: use one again without uploading it twice">🗂 Library</button>
              <select className="btn" aria-label="Picture width" value={imgWidth} onChange={(e) => setImgWidth(e.target.value)}>{["100%", "75%", "50%", "33%"].map((w) => <option key={w}>{w}</option>)}</select>
              <select className="btn" aria-label="Picture alignment" value={imgAlign} onChange={(e) => setImgAlign(e.target.value)}><option>center</option><option>left</option><option>right</option></select>
              <input ref={fileIn} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
            </span>
          </div>
          <textarea ref={ta} className="ox-body" value={d.body} onChange={(e) => set("body", e.target.value)} onKeyDown={onKey} onPaste={onPaste} rows={16} placeholder={"Dear {{first_name|there}},\n\nI'm writing about …"} aria-label="Message" spellCheck />
          <label className="ox-check"><input type="checkbox" checked={d.signature} onChange={(e) => set("signature", e.target.checked)} /> Add my signature{!settings?.signatureMd.trim() && <span className="ox-dim"> (none written yet: Mail settings)</span>}</label>
          <VariantsPanel body={d.body} types={blockTypes} groups={groups} rules={d.rules} onRules={(r) => set("rules", r)} />
        </div>
        <BlocksPanel types={blockTypes} onTypes={onBlockTypes} onInsert={(b) => edit("insert", b)} onToken={(kind) => edit("insert", `{{block:${kind}}}`)} getSelection={getSel} />
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

      {(d.body.trim() || d.subject.trim()) && (() => {
        const notes = pitchChecks({ subject: d.subject, body: d.body, fileBytes: (pv?.attachments ?? []).reduce((n, a) => n + (a.size ?? 0), 0), hasAudioLink: (pv?.attachments ?? []).some((a) => /\.(mp3|wav|flac|ogg|m4a|aac|opus)$/i.test(a.filename)), recipients: total });
        const warns = notes.filter((x) => x.level === "warn").length;
        return (
          <details className="ox-pitch" open={warns > 0}>
            <summary><b>Pitch check</b> <span className={warns ? "ox-due" : "ox-fine"}>{warns ? `${warns} to fix` : "looks sound"}</span></summary>
            <ul>{notes.map((x, i) => <li key={i} className={"ox-pn-" + x.level}>{x.level === "warn" ? "⚠" : x.level === "tip" ? "💡" : "✓"} {x.text}</li>)}</ul>
          </details>
        );
      })()}

      <div className="ox-send">
        <div className="ox-follow">
          <span className="ox-lbl">Remind me to follow up</span>
          <DateInput label="Follow-up date" value={followUp ?? ""} min={today} onSave={(v) => setD((p) => ({ ...p, followUp: v || null, followSet: true }))} />
          {[["+3 d", 3], ["+1 wk", 7], ["+2 wk", 14], ["+1 mo", 30]].map(([l, n]) => <button key={l} className="btn" onClick={() => setD((p) => ({ ...p, followUp: addDays(today, Number(n)), followSet: true }))}>{l}</button>)}
          <button className="btn" onClick={() => setD((p) => ({ ...p, followUp: null, followSet: true }))}>No reminder</button>
        </div>
        <div className="ox-opts">
          {(withEmail.some((c) => c.sentCount > 0) || d.thread) && <label className="ox-check"><input type="checkbox" checked={d.thread} onChange={(e) => set("thread", e.target.checked)} /> Reply in the same conversation as my earlier mail to them</label>}
          <label className="ox-check"><input type="checkbox" checked={d.plain} onChange={(e) => set("plain", e.target.checked)} /> Plain text only (no formatting or pictures in the body; some curators prefer it)</label>
          <label className="ox-check"><input type="checkbox" checked={d.later.on} onChange={(e) => setD((p) => ({ ...p, later: { ...p.later, on: e.target.checked, date: p.later.date || addDays(today, 1) } }))} /> Send later</label>
          {d.later.on && (
            <div className="ox-later">
              <DateInput label="Send on" value={d.later.date} min={today} onSave={(v) => setD((p) => ({ ...p, later: { ...p.later, date: v } }))} />
              <input type="time" aria-label="Send at" value={d.later.time} onChange={(e) => setD((p) => ({ ...p, later: { ...p.later, time: e.target.value } }))} />
              <label className="ox-check"><input type="checkbox" checked={d.later.theirZone} onChange={(e) => setD((p) => ({ ...p, later: { ...p.later, theirZone: e.target.checked } }))} /> at that time in each person's time zone (the Time zone column; yours if empty)</label>
              {stats?.bestHours && stats.bestHours.length > 0 && <p className="ox-dim ox-hint">From your own history, replies come most for mail sent around {stats.bestHours.map((h) => `${String(h).padStart(2, "0")}:00`).join(", ")}.</p>}
              <label className="ox-check"><input type="checkbox" checked={d.later.weekdays} onChange={(e) => setD((p) => ({ ...p, later: { ...p.later, weekdays: e.target.checked } }))} /> move a weekend to Monday</label>
            </div>
          )}
        </div>
        <div className="ox-row">
          {total > 1 && <button className="btn" onClick={openReview} disabled={!!busy}>Review all {total}</button>}
          <button className="btn" onClick={() => send(true)} disabled={!!busy || noMail}>{busy === "test" ? "Sending test…" : "Send test to myself"}</button>
          <button className="btn btn-primary" onClick={() => send(false)} disabled={!!busy || noMail || !d.subject.trim() || !d.body.trim()}>{busy === "send" ? `Sending${total > 1 ? " (one every second or so)" : ""}…` : `${d.later.on ? "Schedule for" : "Send to"} ${total || "…"}`}</button>
          <button className="btn" onClick={() => { if (confirm("Clear this draft?")) setD({ ...EMPTY, accountId: d.accountId, cc: settings?.defaultCc ?? "", bcc: settings?.defaultBcc ?? "" }); setNote(""); }}>Clear draft</button>
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
            {result.scheduled ? <p>Scheduled {result.scheduled} message{result.scheduled === 1 ? "" : "s"}; the first leaves {new Date(result.firstAt as string).toLocaleString()}. They are sent from the server, so this page can be closed.</p> : null}
            {!result.scheduled && <p>{result.test ? "Test sent to your own address." : `Sent ${result.sent}${result.failed ? `, ${result.failed} failed` : ""}.`}{!result.test && result.followUpAt ? ` Reminder set for ${result.followUpAt}.` : ""}{result.skipped.length ? ` Skipped (no email): ${result.skipped.join(", ")}.` : ""}</p>}
            {result.results.filter((r) => !r.ok || r.error).map((r) => <p key={r.to}>{r.to}: {r.error}</p>)}
          </div>
        )}
      </div>

      {scheduled.length > 0 && (
        <div className="ox-scheduled" aria-label="Scheduled messages">
          <h4>Scheduled</h4>
          <ul>{scheduled.map((q) => (
            <li key={q.id} className={q.status === "failed" ? "bad" : ""}><time>{new Date(q.sendAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time> <b>{q.to}</b> {q.subject} <small className="ox-dim">{q.status}</small>{q.error && <em> — {q.error}</em>}
              {q.status === "pending" && <button className="btn-link" onClick={() => cancelScheduled(q.id)}>cancel</button>}</li>
          ))}</ul>
        </div>
      )}
      {review && <ReviewModal rows={review} onClose={() => setReview(null)} onSend={() => send(false)} />}
      {library && <FilesModal mode="pick" groups={groups} onClose={() => setLibrary(false)} onPick={(files: FileItem[]) => { for (const f of files) edit("insert", mediaLine(f.url, f.name, f.mimeType, { width: imgWidth === "100%" ? undefined : imgWidth, align: imgAlign })); setLibrary(false); }} />}

      <details className="ox-history" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && history === null) loadHistory(); }}>
        <summary>Sent from here</summary>
        {history === null ? <p className="ox-dim">Loading…</p> : history.length === 0 ? <p className="ox-dim">Nothing yet.</p> : (
          <ul>{history.map((h) => <li key={h.id} className={h.ok ? "" : "bad"}><time>{h.sentAt.slice(0, 16).replace("T", " ")}</time> <b>{h.to}</b> {h.subject}{h.note ? <em> — {h.note}</em> : null}</li>)}</ul>
        )}
      </details>
    </section>
  );
}
