import { useState } from "react";
import { api } from "../../lib/api";
import type { OutreachSettings } from "./types";

const PRESETS: { label: string; v: Partial<OutreachSettings> }[] = [
  { label: "Gmail", v: { smtpHost: "smtp.gmail.com", smtpPort: 465, smtpSecure: true, imapHost: "imap.gmail.com", imapPort: 993, imapSecure: true, sentFolder: "[Gmail]/Sent Mail", fileInSent: false } },
  { label: "Fastmail", v: { smtpHost: "smtp.fastmail.com", smtpPort: 465, smtpSecure: true, imapHost: "imap.fastmail.com", imapPort: 993, imapSecure: true, sentFolder: "Sent", fileInSent: true } },
  { label: "Outlook", v: { smtpHost: "smtp.office365.com", smtpPort: 587, smtpSecure: false, imapHost: "outlook.office365.com", imapPort: 993, imapSecure: true, sentFolder: "Sent", fileInSent: false } },
  { label: "Proton Bridge", v: { smtpHost: "127.0.0.1", smtpPort: 1025, smtpSecure: false, imapHost: "127.0.0.1", imapPort: 1143, imapSecure: false, sentFolder: "Sent", fileInSent: true } },
];

export function SettingsModal({ settings, onSaved, onClose }: { settings: OutreachSettings; onSaved: (s: OutreachSettings) => void; onClose: () => void }) {
  const [s, setS] = useState<OutreachSettings>(settings);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "test">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof OutreachSettings>(k: K, v: OutreachSettings[K]) => setS((p) => ({ ...p, [k]: v }));

  async function save(): Promise<boolean> {
    setBusy("save"); setMsg(null);
    try {
      const { hasPassword: _h, ...body } = s;
      const out = await api<OutreachSettings>("/api/admin/outreach/settings", { method: "PUT", body: JSON.stringify({ ...body, ...(password ? { password } : {}) }) });
      setS(out); setPassword(""); onSaved(out); return true;
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't save." }); return false; }
    finally { setBusy(""); }
  }
  async function test() {
    if (!(await save())) return;
    setBusy("test");
    try {
      const r = await api<{ smtp: string | null; imap: string | null }>("/api/admin/outreach/settings/test", { method: "POST" });
      const parts = [`Sending: ${r.smtp ? r.smtp : "works"}`]; if (r.imap !== "off") parts.push(`Sent folder: ${r.imap ? r.imap : "works"}`);
      setMsg({ ok: !r.smtp && (r.imap === "off" || !r.imap), text: parts.join(" · ") });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Test failed." }); }
    finally { setBusy(""); }
  }

  return (
    <div className="ox-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ox-modal" role="dialog" aria-label="Mail settings">
        <header><h2>Mail settings</h2><button className="btn" onClick={onClose} aria-label="Close">✕</button></header>
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
          <label className="ox-block">Signature (same writing format as the composer)<textarea rows={4} value={s.signatureMd} onChange={(e) => set("signatureMd", e.target.value)} placeholder={"—\n**Your name**\nComposer · sound artist\n[site](https://example.org)"} /></label>
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
        {msg && <p className={msg.ok ? "ox-ok" : "ox-err"} role="status">{msg.text}</p>}
        <footer>
          <button className="btn" onClick={test} disabled={!!busy}>{busy === "test" ? "Testing…" : "Save & test connection"}</button>
          <button className="btn btn-primary" onClick={async () => { if (await save()) onClose(); }} disabled={!!busy}>{busy === "save" ? "Saving…" : "Save"}</button>
        </footer>
      </div>
    </div>
  );
}
