import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { pasteEdit } from "../../lib/pasteMail";
import type { Contact, Feed, Lead } from "./types";

type Tab = "new" | "paste" | "feeds" | "tools";
const SRC: Record<string, string> = { feed: "feed", newsletter: "newsletter", bookmarklet: "link", form: "form", inbox: "your inbox", eml: "newsletter file" };

/** Where calls wait before they join the sheet: found by a feed, pulled out of a pasted newsletter, or sent from the browser. Keep or dismiss. */
export function InboxModal({ slug, onKept, onCount, onClose }: { slug: string; onKept: (c: Contact[]) => void; onCount: (n: number) => void; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("new");
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [feeds, setFeeds] = useState<Feed[] | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [text, setText] = useState(""); const [feedUrl, setFeedUrl] = useState("");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [err, setErr] = useState("");

  const loadLeads = () => api<Lead[]>("/api/outreach/leads").then((l) => { setLeads(l); onCount(l.length); }).catch((e) => setErr(e instanceof Error ? e.message : "Couldn't load."));
  const loadFeeds = () => api<Feed[]>("/api/outreach/feeds").then(setFeeds).catch(() => setFeeds([]));
  useEffect(() => { void loadLeads(); void loadFeeds(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(action: "keep" | "dismiss", ids: number[]) {
    if (!ids.length) return; setBusy(true); setErr("");
    try {
      const r = await api<{ contacts?: Contact[] }>("/api/outreach/leads/act", { method: "POST", body: JSON.stringify({ ids, action }) });
      if (r.contacts?.length) { onKept(r.contacts); setMsg(`Added ${r.contacts.length} to the list as leads.`); }
      setSel(new Set()); await loadLeads();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed."); }
    setBusy(false);
  }
  async function paste() {
    setBusy(true); setErr(""); setMsg("");
    try { const r = await api<{ found: number; added: number; already?: number }>("/api/outreach/newsletter", { method: "POST", body: JSON.stringify({ text }) }); setMsg(r.found ? `Found ${r.found} call${r.found === 1 ? "" : "s"}; ${r.added} new${r.already ? `, ${r.already} already known` : ""}.` : "No call with a link or a deadline was found in that text."); if (r.added) { setText(""); setTab("new"); await loadLeads(); } }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't read it."); }
    setBusy(false);
  }
  async function importEml(files: FileList | null) {
    if (!files?.length) return; setBusy(true); setErr(""); setMsg("");
    try {
      const fd = new FormData(); for (const f of Array.from(files).slice(0, 200)) fd.append("file", f, f.name);
      const r = await api<{ files: number; mailsWithCalls: number; found: number; added: number; already: number; failed: { name: string; error: string }[] }>("/api/outreach/newsletter/eml", { method: "POST", body: fd });
      setMsg(r.found ? `${r.mailsWithCalls} of ${r.files} mail${r.files === 1 ? "" : "s"} had calls: ${r.found} found, ${r.added} new${r.already ? `, ${r.already} already known` : ""}.` : `No calls found in ${r.files} mail${r.files === 1 ? "" : "s"}.`);
      if (r.failed.length) setErr(`${r.failed.length} file${r.failed.length === 1 ? "" : "s"} couldn't be read (${r.failed[0].name}).`);
      await loadLeads();
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't import them."); }
    setBusy(false);
  }
  async function addFeed() {
    setBusy(true); setErr(""); setMsg("");
    try { await api("/api/outreach/feeds", { method: "POST", body: JSON.stringify({ url: feedUrl }) }); setFeedUrl(""); await Promise.all([loadFeeds(), loadLeads()]); setMsg("Feed added; its current calls are in New."); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't add it."); }
    setBusy(false);
  }
  async function checkNow() { setBusy(true); setErr(""); try { const r = await api<{ added: number }>("/api/outreach/feeds/check", { method: "POST" }); setMsg(`${r.added} new call${r.added === 1 ? "" : "s"} found.`); await Promise.all([loadFeeds(), loadLeads()]); } catch (e) { setErr(e instanceof Error ? e.message : "Failed."); } setBusy(false); }
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const bookmarklet = `javascript:(()=>{window.open('${origin}/outreach/${slug}?capture='+encodeURIComponent(location.href),'_blank')})()`;
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="ox-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ox-modal ox-wide" role="dialog" aria-label="Inbox of new calls">
        <header><h2>New calls</h2><button className="btn" onClick={onClose} aria-label="Close">✕</button></header>
        <div className="ox-tabs" role="tablist">
          {([["new", `New${leads ? ` (${leads.length})` : ""}`], ["paste", "Newsletters"], ["feeds", `Feeds${feeds ? ` (${feeds.length})` : ""}`], ["tools", "Bookmarklet"]] as [Tab, string][]).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={"btn" + (tab === k ? " btn-primary" : "")} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        {msg && <p className="ox-ok" role="status">{msg}</p>}{err && <p className="ox-err" role="alert">{err}</p>}
        {tab === "new" && (!leads ? <p className="ox-dim">Loading…</p> : leads.length === 0 ? <p className="ox-dim">Nothing waiting. Add a feed, paste a newsletter, or use the bookmarklet and calls will collect here.</p> : (
          <>
            <div className="ox-bar"><button className="btn btn-primary" onClick={() => act("keep", sel.size ? [...sel] : leads.map((l) => l.id))} disabled={busy}>Keep {sel.size ? sel.size : "all"}</button><button className="btn" onClick={() => act("dismiss", sel.size ? [...sel] : leads.map((l) => l.id))} disabled={busy}>Dismiss {sel.size ? sel.size : "all"}</button><span className="ox-dim">Kept calls become “Lead” rows with Link and Fee filled in.</span></div>
            <ul className="ox-leads">{leads.map((l) => (
              <li key={l.id} className={sel.has(l.id) ? "on" : ""}>
                <label><input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} aria-label={`Select ${l.title}`} /> <b>{l.title}</b></label>
                <small className="ox-dim"> {SRC[l.source] ?? l.source}{l.deadline ? ` · closes ${l.deadline}` : ""}{l.fee ? ` · fee ${l.fee}` : ""}{l.place ? ` · ${l.place}` : ""}{l.fields.length ? ` · form, ${l.fields.length} questions` : ""}{l.emails.length ? ` · ${l.emails[0]}` : ""}</small>
                {l.summary && <p className="ox-clip">{l.summary}</p>}
                <span className="ox-li-btns">{l.url && <a className="btn" href={l.url} target="_blank" rel="noopener noreferrer">Open</a>}<button className="btn" onClick={() => act("keep", [l.id])} disabled={busy}>Keep</button><button className="btn" onClick={() => act("dismiss", [l.id])} disabled={busy}>Dismiss</button></span>
              </li>))}</ul>
          </>
        ))}
        {tab === "paste" && (
          <>
            <p className="ox-hint">Paste a whole newsletter or a mailing-list digest (links in it are kept). Every paragraph that talks about applying and has a link or a deadline becomes a call in <b>New</b>; the rest is ignored.</p>
            <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} onPaste={(e) => { const el = e.currentTarget; const r = pasteEdit(e, el.value, el.selectionStart, el.selectionEnd); if (!r) return; e.preventDefault(); setText(r.value); }} placeholder="Paste the text of the newsletter here…" aria-label="Newsletter text" />
            <footer><button className="btn btn-primary" onClick={paste} disabled={busy || text.trim().length < 40}>{busy ? "Reading…" : "Find the calls"}</button></footer>
            <hr />
            <p className="ox-hint">Or import newsletters saved as mail files: one or many <b>.eml</b> files, or a <b>.zip</b> of them (drag them out of your mail app). Only the calls are kept, not the mails.</p>
            <label className="btn" style={{ alignSelf: "flex-start" }}>{busy ? "Reading…" : "Import .eml / .zip"}<input type="file" multiple accept=".eml,.zip,message/rfc822,application/zip" hidden disabled={busy} onChange={(e) => { void importEml(e.target.files); e.target.value = ""; }} aria-label="Newsletter mail files" /></label>
          </>
        )}
        {tab === "feeds" && (
          <>
            <p className="ox-hint">Add the RSS / Atom address of a call board. New entries that talk about open calls, submissions or residencies arrive in <b>New</b>. Each feed is checked every six hours by the server.</p>
            <div className="ox-bar"><input value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} placeholder="https://…/feed" aria-label="Feed address" className="ox-search" /><button className="btn btn-primary" onClick={addFeed} disabled={busy || !feedUrl.trim()}>Add feed</button><button className="btn" onClick={checkNow} disabled={busy || !feeds?.length}>Check now</button></div>
            <ul className="ox-leads">{(feeds ?? []).map((f) => <li key={f.id}><b>{f.title || f.url}</b> <small className="ox-dim">{f.lastCheckedAt ? `checked ${f.lastCheckedAt.slice(0, 16).replace("T", " ")}` : "not checked yet"}</small>{f.error && <em className="ox-err"> {f.error}</em>}<span className="ox-li-btns"><button className="btn" onClick={async () => { await api(`/api/outreach/feeds/${f.id}`, { method: "DELETE" }).catch(() => null); void loadFeeds(); }}>Remove</button></span></li>)}</ul>
          </>
        )}
        {tab === "tools" && (
          <>
            <p className="ox-hint">Drag this to your bookmarks bar. On any open-call page, click it: the page is sent here, read, and you only confirm. On a phone, share the link to this site's address instead: <code>{origin}/outreach/{slug}?capture=&lt;address&gt;</code>.</p>
            <p><a className="btn btn-primary" href={bookmarklet} onClick={(e) => e.preventDefault()} draggable>＋ Send to Outreach</a></p>
          </>
        )}
      </div>
    </div>
  );
}
