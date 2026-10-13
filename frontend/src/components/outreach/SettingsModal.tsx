import { useState } from "react";
import { api } from "../../lib/api";
import { pasteEdit } from "../../lib/pasteMail";
import type { OutreachSettings } from "./types";

const PRESETS: { label: string; v: Partial<OutreachSettings> }[] = [
  { label: "Gmail", v: { smtpHost: "smtp.gmail.com", smtpPort: 465, smtpSecure: true, imapHost: "imap.gmail.com", imapPort: 993, imapSecure: true, sentFolder: "[Gmail]/Sent Mail", fileInSent: false } },
  { label: "Fastmail", v: { smtpHost: "smtp.fastmail.com", smtpPort: 465, smtpSecure: true, imapHost: "imap.fastmail.com", imapPort: 993, imapSecure: true, sentFolder: "Sent", fileInSent: true } },
  { label: "Outlook", v: { smtpHost: "smtp.office365.com", smtpPort: 587, smtpSecure: false, imapHost: "outlook.office365.com", imapPort: 993, imapSecure: true, sentFolder: "Sent", fileInSent: false } },
  { label: "Proton Bridge", v: { smtpHost: "127.0.0.1", smtpPort: 1025, smtpSecure: false, imapHost: "127.0.0.1", imapPort: 1143, imapSecure: false, sentFolder: "Sent", fileInSent: true } },
];

export function SettingsModal({ accounts, onChange, onClose }: { accounts: OutreachSettings[]; onChange: (a: OutreachSettings[]) => void; onClose: () => void }) {
  const [curId, setCurId] = useState<number>((accounts.find((a) => a.isDefault) ?? accounts[0]).id);
  const base = accounts.find((a) => a.id === curId) ?? accounts[0];
  const [s, setS] = useState<OutreachSettings>(base);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "test">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof OutreachSettings>(k: K, v: OutreachSettings[K]) => setS((p) => ({ ...p, [k]: v }));
  const pick = (id: number) => { const a = accounts.find((x) => x.id === id); if (!a) return; setCurId(id); setS(a); setPassword(""); setMsg(null); };

  async function save(): Promise<boolean> {
    setBusy("save"); setMsg(null);
    try {
      const { hasPassword: _h, id: _i, inboxCheckedAt: _c, inboxError: _e, ...body } = s;
      const out = await api<OutreachSettings>(`/api/outreach/accounts/${s.id}`, { method: "PUT", body: JSON.stringify({ ...body, ...(password ? { password } : {}) }) });
      setS(out); setPassword(""); onChange(accounts.map((a) => (a.id === out.id ? out : out.isDefault ? { ...a, isDefault: false } : a))); return true;
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't save." }); return false; }
    finally { setBusy(""); }
  }
  async function test() {
    if (!(await save())) return;
    setBusy("test");
    try {
      const r = await api<{ smtp: string | null; imap: string | null }>(`/api/outreach/accounts/${s.id}/test`, { method: "POST" });
      const parts = [`Sending: ${r.smtp ? r.smtp : "works"}`]; if (r.imap !== "off") parts.push(`Sent folder: ${r.imap ? r.imap : "works"}`);
      setMsg({ ok: !r.smtp && (r.imap === "off" || !r.imap), text: parts.join(" · ") });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Test failed." }); }
    finally { setBusy(""); }
  }
  const [inboxMsg, setInboxMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function checkInbox() {
    if (!(await save())) return; setBusy("test"); setInboxMsg(null);
    try {
      const r = await api<{ scanned: number; found: number; added: number; error: string | null }>(`/api/outreach/accounts/${s.id}/inbox-check`, { method: "POST" });
      setInboxMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: `Looked at ${r.scanned} mail${r.scanned === 1 ? "" : "s"}: ${r.found} call${r.found === 1 ? "" : "s"} found, ${r.added} new (in New).` });
      onChange(accounts.map((a) => (a.id === s.id ? { ...a, ...s, inboxCheckedAt: new Date().toISOString(), inboxError: r.error } : a)));
    } catch (e) { setInboxMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't check." }); }
    finally { setBusy(""); }
  }
  async function add() {
    try { const a = await api<OutreachSettings>("/api/outreach/accounts", { method: "POST", body: JSON.stringify({ label: "New mailbox" }) }); onChange([...accounts, a]); setCurId(a.id); setS(a); setPassword(""); setMsg(null); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't add." }); }
  }
  async function remove() {
    if (!confirm(`Remove the mailbox “${s.label || s.fromEmail || "this one"}”? Mail already sent stays in the history.`)) return;
    try { await api(`/api/outreach/accounts/${s.id}`, { method: "DELETE" }); const rest = accounts.filter((a) => a.id !== s.id).map((a, i) => (s.isDefault && i === 0 ? { ...a, isDefault: true } : a)); onChange(rest); setCurId(rest[0].id); setS(rest[0]); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't remove." }); }
  }

  return (
    <div className="ox-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ox-modal" role="dialog" aria-label="Mail settings">
        <header><h2>Mailboxes</h2><button className="btn" onClick={onClose} aria-label="Close">✕</button></header>
        <div className="ox-tabs" role="tablist" aria-label="Mailboxes">
          {accounts.map((a) => <button key={a.id} role="tab" aria-selected={a.id === curId} className={"btn" + (a.id === curId ? " btn-primary" : "")} onClick={() => pick(a.id)}>{a.label || a.fromEmail || `Mailbox ${a.id}`}{a.isDefault ? " ★" : ""}</button>)}
          <button className="btn" onClick={add} title="Another address this artist can send from">＋ Add mailbox</button>
        </div>
        <div className="ox-grid">
          <label>Name of this mailbox<input value={s.label} onChange={(e) => set("label", e.target.value)} placeholder="Booking, Label, Personal…" /></label>
          <label className="ox-check"><input type="checkbox" checked={s.isDefault} onChange={(e) => set("isDefault", e.target.checked)} disabled={s.isDefault} /> The one chosen first in “Send as”</label>
        </div>
        <div className="ox-presets">Fill in for: {PRESETS.map((p) => <button key={p.label} className="btn-link" onClick={() => setS((x) => ({ ...x, ...p.v }))}>{p.label}</button>)}</div>
        <fieldset><legend>Sending (SMTP)</legend>
          <div className="ox-grid">
            <label>Server<input value={s.smtpHost} onChange={(e) => set("smtpHost", e.target.value)} placeholder="smtp.example.com" /></label>
            <label>Port<input type="number" value={s.smtpPort} onChange={(e) => set("smtpPort", Number(e.target.value))} /></label>
            <label className="ox-check"><input type="checkbox" checked={s.smtpSecure} onChange={(e) => set("smtpSecure", e.target.checked)} /> SSL (465). Off = STARTTLS (587)</label>
            <label>Login<input value={s.smtpUser} onChange={(e) => set("smtpUser", e.target.value)} autoComplete="off" /></label>
            <label>Password {s.hasPassword && <em>(saved: leave empty to keep)</em>}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder={s.hasPassword ? "••••••••" : "app password"} /></label>
          </div>
          <p className="ox-hint">Gmail and most big providers need an <b>app password</b>, not your normal one. It is stored encrypted on your server.</p>
        </fieldset>
        <fieldset><legend>Who you are</legend>
          <div className="ox-grid">
            <label>From name<input value={s.fromName} onChange={(e) => set("fromName", e.target.value)} /></label>
            <label>From address<input value={s.fromEmail} onChange={(e) => set("fromEmail", e.target.value)} placeholder={s.smtpUser || "you@example.com"} /></label>
            <label>Reply-To<input value={s.replyTo} onChange={(e) => set("replyTo", e.target.value)} placeholder="optional" /></label>
            <label>Default Cc<input value={s.defaultCc} onChange={(e) => set("defaultCc", e.target.value)} placeholder="a@x.org, b@y.org" /></label>
            <label>Default Bcc<input value={s.defaultBcc} onChange={(e) => set("defaultBcc", e.target.value)} placeholder="a copy for your records" /></label>
            <label>Follow-up after (days)<input type="number" min={1} max={365} value={s.followUpDays} onChange={(e) => set("followUpDays", Number(e.target.value))} /></label>
          </div>
          <label className="ox-block">Signature (same writing format as the composer; formatted text can be pasted in)<textarea rows={4} onPaste={(e) => { const el = e.currentTarget; const r = pasteEdit(e, el.value, el.selectionStart, el.selectionEnd); if (!r) return; e.preventDefault(); set("signatureMd", r.value); requestAnimationFrame(() => el.setSelectionRange(r.start, r.end)); }} value={s.signatureMd} onChange={(e) => set("signatureMd", e.target.value)} placeholder={"—\n**Your name**\nComposer · sound artist\n[site](https://example.org)"} /></label>
        </fieldset>
        <fieldset><legend>Copy in your Sent folder (IMAP)</legend>
          <label className="ox-check"><input type="checkbox" checked={s.fileInSent} onChange={(e) => set("fileInSent", e.target.checked)} /> Put a copy of each message in my Sent folder</label>
          <p className="ox-hint"><b>Gmail, Fastmail-style and most hosted providers already do this themselves</b> when you send through them. Leave this off for those, or you will get every mail twice. Turn it on for hosts that don't (cPanel / OVH / own server).</p>
          <div className="ox-grid">
            <label>IMAP server<input value={s.imapHost} onChange={(e) => set("imapHost", e.target.value)} placeholder="imap.example.com" /></label>
            <label>Port<input type="number" value={s.imapPort} onChange={(e) => set("imapPort", Number(e.target.value))} /></label>
            <label className="ox-check"><input type="checkbox" checked={s.imapSecure} onChange={(e) => set("imapSecure", e.target.checked)} /> SSL</label>
            <label>Sent folder name<input value={s.sentFolder} onChange={(e) => set("sentFolder", e.target.value)} /></label>
          </div>
        </fieldset>
        <fieldset><legend>Look for open calls in my inbox (IMAP)</legend>
          <label className="ox-check"><input type="checkbox" checked={s.inboxOn} onChange={(e) => set("inboxOn", e.target.checked)} disabled={!s.imapHost} /> Check this mailbox every half hour for open calls and newsletters that list them</label>
          <p className="ox-hint">{s.imapHost ? <>Read-only: mail is never moved, marked or deleted, and only each call's title, link, deadline and fee are kept, not the mail. The first check looks back 30 days. Calls land in <b>New</b>.</> : <>Fill in the IMAP server above first.</>}</p>
          <div className="ox-grid"><label>Folder to watch<input value={s.inboxFolder} onChange={(e) => set("inboxFolder", e.target.value)} placeholder="INBOX" /></label></div>
          <div className="ox-colrow"><button className="btn" onClick={checkInbox} disabled={!!busy || !s.imapHost}>Save &amp; check now</button>
            <small className="ox-dim">{s.inboxCheckedAt ? `last checked ${s.inboxCheckedAt.slice(0, 16).replace("T", " ")}` : "not checked yet"}</small></div>
          {(inboxMsg || s.inboxError) && <p className={inboxMsg?.ok ? "ox-ok" : "ox-err"} role="status">{inboxMsg?.text ?? s.inboxError}</p>}
        </fieldset>
        {msg && <p className={msg.ok ? "ox-ok" : "ox-err"} role="status">{msg.text}</p>}
        <footer>
          {accounts.length > 1 && <button className="btn" onClick={remove} disabled={!!busy}>Remove this mailbox</button>}
          <button className="btn" onClick={test} disabled={!!busy}>{busy === "test" ? "Testing…" : "Save & test connection"}</button>
          <button className="btn btn-primary" onClick={async () => { if (await save()) onClose(); }} disabled={!!busy}>{busy === "save" ? "Saving…" : "Save"}</button>
        </footer>
      </div>
    </div>
  );
}
