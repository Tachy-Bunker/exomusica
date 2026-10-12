import { useState } from "react";
import { api } from "../../lib/api";
import { saveSession, useSession, currentSession } from "../../lib/outreachSession";
import { parseLatLng } from "../../lib/geo";
import type { FitProfile, WorkspaceInfo } from "./types";

const list = (s: string): string[] => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const num = (s: string): number | null => { const n = Number(s.replace(",", ".")); return s.trim() && Number.isFinite(n) && n >= 0 ? n : null; };

export function WorkspaceModal({ ws, onChange, onClose, onLeave }: { ws: WorkspaceInfo; onChange: (w: WorkspaceInfo) => void; onClose: () => void; onLeave: () => void }) {
  const p = ws.profile;
  const [name, setName] = useState(ws.name);
  const [track, setTrack] = useState(ws.trackLinks);
  const [digest, setDigest] = useState(ws.digestOn);
  const [dnc, setDnc] = useState(ws.dnc.join("\n"));
  const [kw, setKw] = useState((p.keywords ?? []).join(", "));
  const [avoid, setAvoid] = useState((p.avoid ?? []).join(", "));
  const [regions, setRegions] = useState((p.regions ?? []).join(", "));
  const [maxFee, setMaxFee] = useState(p.maxFee == null ? "" : String(p.maxFee));
  const [budget, setBudget] = useState(p.yearlyBudget == null ? "" : String(p.yearlyBudget));
  const [home, setHome] = useState(p.home ?? "");
  const [pw, setPw] = useState({ current: "", next: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const link = `${window.location.origin}/outreach/${ws.slug}`;
  const fail = (e: unknown) => setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong." });

  async function save() {
    setBusy(true); setMsg(null);
    try {
      let lat = p.homeLat ?? null, lng = p.homeLng ?? null;
      if (home.trim() && home.trim() !== p.home) {
        const c = parseLatLng(home); if (c) { lat = c.lat; lng = c.lng; }
        else { const g = await api<{ lat: number; lng: number }>("/api/outreach/geocode", { method: "POST", body: JSON.stringify({ q: home }) }); lat = g.lat; lng = g.lng; }
      } else if (!home.trim()) { lat = null; lng = null; }
      const profile: FitProfile = { keywords: list(kw), avoid: list(avoid), regions: list(regions), maxFee: num(maxFee), yearlyBudget: num(budget), home: home.trim(), homeLat: lat, homeLng: lng };
      const out = await api<Partial<WorkspaceInfo> & { name: string }>("/api/outreach/workspace", { method: "PUT", body: JSON.stringify({ name, trackLinks: track, digestOn: digest, dnc: list(dnc), profile }) });
      onChange({ ...ws, ...out, profile: out.profile ?? profile }); onClose();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  const adopt = (token: string) => { const s = currentSession(); if (s) { const n = { ...s, token }; saveSession(n); useSession(n); } };
  async function changePw() {
    setBusy(true); setMsg(null);
    try { const r = await api<{ token: string }>("/api/outreach/workspace/password", { method: "POST", body: JSON.stringify(pw) }); adopt(r.token); setPw({ current: "", next: "" }); setMsg({ ok: true, text: "Password changed. Everyone else has been signed out." }); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function signOutAll() {
    if (!confirm("Sign out everyone else? They will need the password again.")) return;
    try { const r = await api<{ token: string }>("/api/outreach/workspace/sign-out-everyone", { method: "POST" }); adopt(r.token); setMsg({ ok: true, text: "Everyone else is signed out." }); } catch (e) { fail(e); }
  }
  async function del() {
    const password = prompt(`Delete “${ws.name}” with ALL its contacts, mail history and files?\nType the workspace password to confirm.`); if (password === null) return;
    try { await api("/api/outreach/workspace", { method: "DELETE", body: JSON.stringify({ password }) }); onLeave(); } catch (e) { fail(e); }
  }

  return (
    <div className="ox-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ox-modal" role="dialog" aria-label="Workspace">
        <header><h2>Workspace</h2><button className="btn" onClick={onClose} aria-label="Close">✕</button></header>
        <fieldset><legend>Sharing</legend>
          <label className="ox-block">Name (the artist)<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
          <p className="ox-hint">Anyone with this address <b>and the password</b> can manage this artist's contacts, mailboxes and mail.</p>
          <div className="ox-colrow"><input readOnly value={link} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1 }} aria-label="Workspace address" /><button className="btn" onClick={() => { void navigator.clipboard?.writeText(link); setMsg({ ok: true, text: "Address copied." }); }}>Copy</button></div>
        </fieldset>
        <fieldset><legend>Fit &amp; budget</legend>
          <p className="ox-hint">Used for the fit score (0–100) in the sheet and for “look-alike” suggestions. All optional.</p>
          <div className="ox-grid">
            <label>Keywords you want<input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="electroacoustic, noise, residency" /></label>
            <label>Words to avoid<input value={avoid} onChange={(e) => setAvoid(e.target.value)} placeholder="pay to play, entry fee" /></label>
            <label>Regions / countries<input value={regions} onChange={(e) => setRegions(e.target.value)} placeholder="France, Belgium, online" /></label>
            <label>Max submission fee<input inputMode="decimal" value={maxFee} onChange={(e) => setMaxFee(e.target.value)} placeholder="10" /></label>
            <label>Yearly fee budget<input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="100" /></label>
            <label>Home (city or coordinates)<input value={home} onChange={(e) => setHome(e.target.value)} placeholder="Lyon  ·  45.76, 4.84" /></label>
          </div>
        </fieldset>
        <fieldset><legend>Do not contact</legend>
          <label className="ox-block">One address or @domain per line<textarea rows={3} value={dnc} onChange={(e) => setDnc(e.target.value)} placeholder={"someone@example.org\n@spam-label.com"} /></label>
          <p className="ox-hint">Never mailed, never imported, even by accident.</p>
        </fieldset>
        <fieldset><legend>Automation</legend>
          <label className="ox-check"><input type="checkbox" checked={digest} onChange={(e) => setDigest(e.target.checked)} /> Monday digest: deadlines and follow-ups of the week, mailed to the main mailbox</label>
          <label className="ox-check"><input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} disabled={!ws.trackAvailable} /> Count clicks on links in sent mail</label>
          {!ws.trackAvailable && <p className="ox-hint">Needs <code>PUBLIC_URL</code> set on the server (e.g. https://exomusica.org).</p>}
        </fieldset>
        <fieldset><legend>Access</legend>
          <div className="ox-grid">
            <label>Current password<input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></label>
            <label>New password (8+)<input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></label>
          </div>
          <div className="ox-colrow"><button className="btn" onClick={changePw} disabled={busy || pw.next.length < 8}>Change password</button><button className="btn" onClick={signOutAll}>Sign out everyone else</button></div>
        </fieldset>
        {msg && <p className={msg.ok ? "ox-ok" : "ox-err"} role="status">{msg.text}</p>}
        <footer>
          <button className="btn" onClick={del} style={{ marginRight: "auto" }}>Delete workspace…</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </footer>
      </div>
    </div>
  );
}
