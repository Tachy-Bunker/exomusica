import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useNarrow } from "../lib/useNarrow";
import { useProfileStore } from "../lib/profileStore";
import { mergeInbox, mergeThread, type Item, type LetterBox, type PmConv, type ThreadMessage } from "../lib/post";
import type { Doc } from "../lib/letterDoc";
import { renderMessageContent } from "../lib/formatMessage";
import { useMentionResolutionStore } from "../lib/mentionResolutionStore";
import { AttachmentPreview } from "../components/AttachmentPreview";
import { LetterComposer } from "../components/LetterComposer";
import { LetterView } from "../components/LetterView";
import { MdBox } from "../components/MdBox";

interface Full { id: number; doc: Doc; from: string; at: string; mine: boolean; canBlock: boolean }
const EMPTY: Doc = { bg: "paper", items: [] };
const when = (s: number) => new Date(s * 1000).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Post: messages and letters in one place, per person. A message is quick text; a letter is a sheet you draw on, can send slowly, or leave on a place for the Trace lens. */
export function PostPage() {
  useDocumentTitle("Post");
  const { user } = useAuth();
  const { username } = useParams<{ username?: string }>();
  const nav = useNavigate();
  const loc = useLocation();
  const [sp] = useSearchParams();
  const at = sp.get("at");
  const narrow = useNarrow(760);
  const [convs, setConvs] = useState<PmConv[]>([]);
  const [box, setBox] = useState<LetterBox | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [mode, setMode] = useState<"msg" | "letter">(at || (loc.state as { letter?: boolean } | null)?.letter ? "letter" : "msg");
  const [draft, setDraft] = useState("");
  const [doc, setDoc] = useState<Doc>(EMPTY);
  const [composerKey, setComposerKey] = useState(0);
  const [hours, setHours] = useState(0);
  const [unsigned, setUnsigned] = useState(false);
  const [to, setTo] = useState("");
  const [find, setFind] = useState("");
  const [full, setFull] = useState<Full | null>(null);
  const [files, setFiles] = useState<{ id: number; filename: string }[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const mentionCache = useMentionResolutionStore((s) => s.cache);
  const resolveMentions = useMentionResolutionStore((s) => s.resolve);

  useEffect(() => { if ((loc.state as { letter?: boolean } | null)?.letter) setMode("letter"); }, [loc.key]); // eslint-disable-line react-hooks/exhaustive-deps
  // old links: /letters?to=name  (the route redirects here with the search kept)
  useEffect(() => { const t = sp.get("to"); if (t && !username) nav(`/pms/${encodeURIComponent(t)}`, { replace: true, state: { letter: true } }); }, [sp, username, nav]);

  const loadList = useCallback(() => {
    if (!user) return;
    void api<PmConv[]>("/api/pms").then((c) => setConvs(Array.isArray(c) ? c : [])).catch(() => setConvs([]));
    void api<LetterBox>("/api/letters/inbox").then((b) => setBox(b && Array.isArray(b.got) ? b : { got: [], sent: [] })).catch(() => setBox({ got: [], sent: [] }));
  }, [user]);
  const loadThread = useCallback(() => {
    if (!username) { setThread([]); return; }
    void api<ThreadMessage[]>(`/api/pms/${encodeURIComponent(username)}`).then((t) => { setThread(Array.isArray(t) ? t : []); void useProfileStore.getState().refresh().catch(() => {}); }).catch(() => setThread([]));
  }, [username]);
  useEffect(loadList, [loadList]);
  useEffect(() => { setFull(null); setMsg(null); loadThread(); }, [loadThread]);
  useEffect(() => { // quiet refresh when you come back to the tab
    const on = () => { if (document.visibilityState === "visible") { loadList(); loadThread(); } };
    document.addEventListener("visibilitychange", on); return () => document.removeEventListener("visibilitychange", on);
  }, [loadList, loadThread]);
  useEffect(() => { const ids = thread.flatMap((m) => [...m.contentRaw.matchAll(/<@(\d+)>/g)].map((x) => x[1])); if (ids.length) resolveMentions(ids); }, [thread, resolveMentions]);

  const rows = useMemo(() => mergeInbox(convs, box), [convs, box]);
  const items: Item[] = useMemo(() => (username ? mergeThread(username, thread, box) : []), [username, thread, box]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [items.length, username]);

  async function openLetter(id: number) {
    if (full?.id === id) { setFull(null); return; }
    setFull(await api<Full>(`/api/letters/${id}`).catch(() => null));
    loadList(); window.dispatchEvent(new Event("exomusica:letters")); void useProfileStore.getState().refresh().catch(() => {});
  }
  async function sendText() {
    if (!username || (!draft.trim() && files.length === 0) || busy) return;
    setBusy(true); setMsg(null);
    try {
      await api(`/api/pms/${encodeURIComponent(username)}`, { method: "POST", body: JSON.stringify({ contentRaw: draft, attachmentIds: files.map((f) => f.id) }) });
      setDraft(""); setFiles([]); loadThread(); loadList();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't send it" }); } finally { setBusy(false); }
  }
  async function sendLetter() {
    const target = username ?? to.trim();
    setBusy(true); setMsg(null);
    try {
      await api("/api/letters", { method: "POST", body: JSON.stringify(at ? { doc, at, unsigned, days: 30 } : { doc, to: target, hours }) });
      if (at) { nav(-1); return; }
      setMsg({ ok: true, text: hours ? `On its way. It arrives in ${hours} h.` : "Sent." }); setDoc(EMPTY); setComposerKey((k) => k + 1); setMode("msg"); loadList();
      if (!username) nav(`/pms/${encodeURIComponent(target)}`);
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't send it" }); } finally { setBusy(false); }
  }
  async function pickFiles(e: ChangeEvent<HTMLInputElement>) {
    const list = e.target.files; if (!list || !list.length) return;
    const fd = new FormData(); for (const f of list) fd.append("files", f);
    const r = await api<{ created: { id: number; filename: string }[] }>("/api/attachments", { method: "POST", body: fd }).catch(() => null);
    if (r) setFiles((p) => [...p, ...r.created]);
    if (fileRef.current) fileRef.current.value = "";
  }
  const act = (p: Promise<unknown>) => p.then(() => { setFull(null); loadList(); });

  if (!user) return <div className="page-column"><h1>Post</h1><p className="home-dim"><Link to="/login">Log in</Link> to send and receive messages and letters.</p></div>;
  const showList = !narrow || (!username && !at);
  const showPane = !narrow || !!username || !!at;
  return (
    <div className="post-page" data-testid="post-page">
      {showList && (
        <nav className="post-list" aria-label="Conversations">
          <form className="post-new" onSubmit={(e) => { e.preventDefault(); const v = find.trim(); if (v) { setFind(""); nav(`/pms/${encodeURIComponent(v)}`); } }}>
            <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Write to… (username)" aria-label="Start a conversation" data-testid="post-new" />
            <button className="btn" type="submit" disabled={!find.trim()}>Go</button>
          </form>
          {box === null && rows.length === 0 ? <p className="home-dim">Loading…</p> : rows.length === 0 ? <p className="home-dim">Nothing yet. Type a username above, or visit someone's profile.</p> : (
            <ul data-testid="post-rows">
              {rows.map((r) => (
                <li key={r.partner}>
                  <Link to={`/pms/${encodeURIComponent(r.partner)}`} className={`post-row${r.unread ? " unread" : ""}${username?.toLowerCase() === r.partner.toLowerCase() ? " on" : ""}`} data-testid="post-row">
                    <b>{r.unread && <i className="post-dot" aria-label="unread" />}{r.partner}</b>
                    {r.letters > 0 && <span className="post-env" title={`${r.letters} letter${r.letters > 1 ? "s" : ""}`}>✉ {r.letters}</span>}
                    <span className="post-prev">{r.preview.replace(/\s+/g, " ").slice(0, 90)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </nav>
      )}
      {showPane && (
        <section className="post-pane">
          {narrow && <p className="post-back"><Link to="/pms">‹ All conversations</Link></p>}
          {at ? <h2 className="post-title">Drop a beacon <span className="home-dim">on {at.replace(":", " · ")}</span></h2>
            : username ? <h2 className="post-title"><Link to={`/u/${username}`}>{username}</Link></h2>
              : <h2 className="post-title">Post</h2>}
          {!username && !at && (
            <div className="post-empty home-dim">
              <p>Pick a conversation, or start one. Messages are quick text. Letters are drawn sheets: you can send them slowly (they arrive hours later) or leave one on a place for the Trace lens.</p>
              <p>Writing supports <code>**bold**</code>, <code>*italic*</code>, lists, <code>```code```</code>, quotes, dividers, links, <code>#name</code> to link a thing, and pictures from this site.</p>
            </div>
          )}
          {username && (
            <div className="post-thread" data-testid="post-thread">
              {items.length === 0 && <p className="home-dim">No messages or letters yet.</p>}
              {items.map((it) => it.kind === "msg" ? (
                <div key={it.key} className={`post-msg${it.m.fromMe ? " me" : ""}`} data-testid="post-msg">
                  {renderMessageContent(it.m.contentRaw, nav, mentionCache)}
                  {it.m.attachments.map((a) => <AttachmentPreview key={a.id} attachment={a} />)}
                  <time className="post-time">{when(it.at)}</time>
                </div>
              ) : (
                <div key={it.key} className={`post-letter${it.mine ? " me" : ""}${it.waiting ? " waiting" : ""}${!it.opened ? " fresh" : ""}`} data-testid="post-letter">
                  <button type="button" className="post-stamp" onClick={() => void openLetter(it.id)} aria-expanded={full?.id === it.id} data-testid="letter-open-btn">
                    <span aria-hidden="true">✉</span> {it.mine ? "Your letter" : `Letter from ${username}`} <em>{it.waiting ? `in the post · arrives ${when(it.at)}` : it.opened ? when(it.at) : `new · ${when(it.at)}`}</em>
                  </button>
                  {full?.id === it.id && (
                    <div className="letter-open" data-testid="letter-open">
                      <LetterView doc={full.doc} />
                      <div className="xl-form-row">
                        {!full.mine && <button className="btn" onClick={() => { setMode("letter"); setFull(null); }}>Write back</button>}
                        <button className="btn" onClick={() => void act(api(`/api/letters/${full.id}`, { method: "DELETE" }))}>Delete</button>
                        {full.canBlock && <button className="btn btn-danger" onClick={() => void act(api(`/api/letters/${full.id}/block`, { method: "POST" }))} data-testid="letter-block">Stop letters from {full.from}</button>}
                        <button className="btn" onClick={() => setFull(null)}>Close</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
          {msg && <p className={msg.ok ? "home-dim" : "an-err"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
          {(username || at) && (
            <div className="post-compose" data-testid="post-compose">
              {!at && (
                <div className="post-modes" role="tablist">
                  <button type="button" role="tab" aria-selected={mode === "msg"} className={mode === "msg" ? "on" : ""} onClick={() => setMode("msg")} data-testid="mode-msg">Message</button>
                  <button type="button" role="tab" aria-selected={mode === "letter"} className={mode === "letter" ? "on" : ""} onClick={() => setMode("letter")} data-testid="mode-letter">Letter</button>
                </div>
              )}
              {mode === "msg" && !at ? (
                <MdBox value={draft} onChange={setDraft} onSubmit={() => void sendText()} placeholder={`Message ${username}…  (Enter sends, Shift+Enter for a new line)`}>
                  {files.length > 0 && <div className="post-files">{files.map((f) => <span key={f.id} className="btn">📎 {f.filename} <button type="button" aria-label="Remove" onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))}>×</button></span>)}</div>}
                  <div className="post-send">
                    <input ref={fileRef} type="file" multiple onChange={(e) => void pickFiles(e)} hidden />
                    <button type="button" className="btn" onClick={() => fileRef.current?.click()} title="Attach a file" aria-label="Attach a file">📎</button>
                    <button type="button" className="btn btn-primary" disabled={busy || (!draft.trim() && files.length === 0)} onClick={() => void sendText()} data-testid="post-send">Send</button>
                  </div>
                </MdBox>
              ) : (
                <>
                  <LetterComposer key={composerKey} onChange={setDoc} />
                  <div className="comp-send" data-testid="comp-send">
                    {at ? (
                      <>
                        <p>Leaving this on <b>{at.replace(":", " · ")}</b>. It stays for 30 days and shows only to people with the Trace lens on there.</p>
                        <label><input type="checkbox" checked={unsigned} onChange={(e) => setUnsigned(e.target.checked)} /> Leave it unsigned (the team can still see who wrote it)</label>
                      </>
                    ) : (
                      <div className="xl-form-row">
                        <label>Slow post <select value={hours} onChange={(e) => setHours(Number(e.target.value))} aria-label="Slow post"><option value={0}>deliver now</option><option value={6}>in 6 hours</option><option value={24}>tomorrow</option><option value={72}>in 3 days</option></select></label>
                      </div>
                    )}
                    <button className="btn btn-primary" disabled={busy || doc.items.length === 0} onClick={() => void sendLetter()} data-testid="comp-submit">{at ? "Leave it here" : "Send letter"}</button>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
