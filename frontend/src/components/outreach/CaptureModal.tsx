import { useState } from "react";
import { useEffect } from "react";
import { api } from "../../lib/api";
import { mapLinks } from "../../lib/geo";
import type { Contact, Group, Opportunity } from "./types";

/** Paste the link (or the text) of an open call; the title, address, deadline and fee are read for you to check, then it becomes a row. */
export function CaptureModal({ groups, initialUrl, onAdded, onClose }: { groups: Group[]; initialUrl?: string; onAdded: (c: Contact) => void; onClose: () => void }) {
  const [src, setSrc] = useState(initialUrl ?? ""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [o, setO] = useState<Opportunity | null>(null);
  const [f, setF] = useState({ name: "", email: "", deadline: "", fee: "", url: "", group: "" });
  const [place, setPlace] = useState(""); const [keepForm, setKeepForm] = useState(true);
  const isUrl = /^https?:\/\/\S+$/i.test(src.trim());

  async function read(text = src) {
    setBusy(true); setErr("");
    try {
      const url = /^https?:\/\/\S+$/i.test(text.trim());
      const r = await api<Opportunity>("/api/outreach/capture", { method: "POST", body: JSON.stringify(url ? { url: text.trim() } : { text }) });
      setO(r); setPlace(r.place ?? ""); setF({ name: r.title, email: r.emails[0] ?? "", deadline: r.deadline ?? "", fee: r.fee ?? "", url: r.url ?? "", group: "" });
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't read that."); }
    setBusy(false);
  }
  // opened by the bookmarklet: the address is already here
  useEffect(() => { if (initialUrl) void read(initialUrl); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function toInbox() {
    if (!o) return; setBusy(true); setErr("");
    try { await api("/api/outreach/leads", { method: "POST", body: JSON.stringify({ title: f.name, url: f.url, deadline: f.deadline || null, fee: f.fee || null, place, emails: f.email ? [f.email] : o.emails, fields: o.form?.fields ?? [], source: "capture" }) }); onClose(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't send it to the inbox."); }
    setBusy(false);
  }
  async function add() {
    setBusy(true); setErr("");
    try {
      const questions = keepForm && o?.form?.fields.length ? o.form.fields.map((q) => `• ${q.label}${q.required ? " *" : ""}${q.options.length ? ` (${q.options.slice(0, 6).join(" / ")})` : ""}`).join("\n") : "";
      const fill = [f.url && { name: "Link", type: "url", value: f.url }, f.fee && { name: "Fee", type: "text", value: f.fee }, questions && { name: "Form questions", type: "longtext", value: questions }].filter(Boolean);
      const geo = o?.lat != null && o.lng != null && place === (o.place ?? "") ? { lat: o.lat, lng: o.lng } : {};
      const c = await api<Contact>("/api/outreach/contacts", { method: "POST", body: JSON.stringify({ name: f.name, email: f.email, status: "lead", deadline: f.deadline || undefined, groups: f.group ? [Number(f.group)] : [], place, ...geo, source: "capture", fill }) });
      onAdded(c); onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't add it."); }
    setBusy(false);
  }
  return (
    <div className="ox-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ox-modal" role="dialog" aria-label="Add an opportunity">
        <header><h2>Add an opportunity</h2><button className="btn" onClick={onClose} aria-label="Close">✕</button></header>
        {!o ? (
          <>
            <p className="ox-hint">Paste the web address of a festival or open call, or paste its text. The title, contact address, deadline and fee are read for you to check.</p>
            <textarea rows={5} value={src} onChange={(e) => setSrc(e.target.value)} placeholder="https://… or the text of the call" aria-label="Link or text" />
            <footer><button className="btn btn-primary" onClick={() => read()} disabled={busy || !src.trim()}>{busy ? "Reading…" : "Read it"}</button></footer>
          </>
        ) : (
          <>
            <p className="ox-hint">Check what was found; nothing is saved until you add it.{o.emails.length > 1 && <> Other addresses on the page: {o.emails.slice(1).join(", ")}.</>}</p>
            <div className="ox-grid">
              <label>Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
              <label>Email{o.emails.length > 1 && <select value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })}>{o.emails.map((m) => <option key={m}>{m}</option>)}</select>}<input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="not found: add it" /></label>
              <label>Deadline<input type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></label>
              <label>Fee<input value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} placeholder="not found" /></label>
              <label>Link<input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></label>
              <label>Group<select value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })}><option value="">none</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
            </div>
            <label className="ox-block">Place<input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="City, country (found on the page, or type it)" /></label>
            {o.lat != null && o.lng != null && place === (o.place ?? "") && (() => { const m = mapLinks({ place, lat: o.lat, lng: o.lng }); return m ? <p className="ox-hint">📍 {o.lat.toFixed(4)}, {o.lng.toFixed(4)} · <a href={m.google} target="_blank" rel="noreferrer">map</a></p> : null; })()}
            {o.blocked && <p className="ox-err">This address is on your do-not-contact list. It can be saved, but it will never be mailed.</p>}
            {o.existing && o.existing.length > 0 && <p className="ox-warn">Already in your list: {o.existing.map((x) => x.name || x.email).join(", ")}. Adding it makes a second row; the duplicate finder can merge them.</p>}
            {o.form && o.form.fields.length > 0 && (
              <details open className="ox-form-q"><summary>{o.form.kind === "google" ? "Google Form" : "Web form"} · {o.form.fields.length} question{o.form.fields.length === 1 ? "" : "s"}</summary>
                <ul>{o.form.fields.map((q, i) => <li key={i}>{q.label}{q.required && " *"}{q.options.length > 0 && <small className="ox-dim"> — {q.options.slice(0, 5).join(" / ")}</small>}</li>)}</ul>
                <label className="ox-check"><input type="checkbox" checked={keepForm} onChange={(e) => setKeepForm(e.target.checked)} /> Keep the questions in a “Form questions” column</label>
              </details>
            )}
            {!o.deadline && <p className="ox-warn">No deadline was found with certainty: set it yourself if the call has one.</p>}
            <footer><button className="btn" onClick={() => setO(null)}>Back</button><button className="btn" onClick={toInbox} disabled={busy || !f.name.trim()} title="Decide later, from the New list">Save for later</button><button className="btn btn-primary" onClick={add} disabled={busy || !f.name.trim()}>{busy ? "Adding…" : "Add to the list"}</button></footer>
          </>
        )}
        {err && <p className="ox-err" role="alert">{err}</p>}
      </div>
    </div>
  );
}
