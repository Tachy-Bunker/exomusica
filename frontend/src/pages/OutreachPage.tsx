import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { allSessions, forgetSession, saveSession, savedSession, useSession, type OxSession } from "../lib/outreachSession";
import { TodayPanel } from "../components/outreach/TodayPanel";
import { ResultsPanel } from "../components/outreach/ResultsPanel";
import { Composer } from "../components/outreach/Composer";
import { ContactSheet } from "../components/outreach/ContactSheet";
import { SettingsModal } from "../components/outreach/SettingsModal";
import { WorkspaceModal } from "../components/outreach/WorkspaceModal";
import { InboxModal } from "../components/outreach/InboxModal";
import { MessagesModal } from "../components/outreach/MessagesModal";
import { FilesModal } from "../components/outreach/FilesModal";
import type { AttachRule, BlockType, CellValue, Col, Contact, Group, OutreachSettings, OutreachState, Template, WorkspaceInfo } from "../components/outreach/types";

type Patch = { status?: string; deadline?: string | null; timezone?: string; groups?: number[]; name?: string; email?: string; set?: Record<string, CellValue>; lastSentAt?: string | null; sentCount?: number; followUpAt?: string | null; place?: string; lat?: number | null; lng?: number | null; doNotContact?: boolean; snoozeReason?: string; declineReason?: string; reopensAt?: string | null };
const errText = (e: unknown, d: string) => (e instanceof Error ? e.message : d);

interface Listing { workspaces: { id: number; slug: string; name: string }[]; admin: boolean; canCreate: boolean; legacy: number }

/** Outside the Admin panel: the address picks the artist's workspace, the password lets you in. */
export function OutreachPage() {
  const { slug = "" } = useParams();
  const nav = useNavigate();
  const [session, setSession] = useState<OxSession | null>(() => { const s = slug ? savedSession(slug) : null; useSession(s); return s; });
  const [adminOpen, setAdminOpen] = useState<OxSession | null>(null);
  useEffect(() => { document.title = "Outreach"; }, []);
  useEffect(() => {
    const s = adminOpen?.slug === slug ? adminOpen : savedSession(slug);
    useSession(s); setSession(s);
  }, [slug, adminOpen]);
  useEffect(() => {
    const onLock = () => { if (slug) forgetSession(slug); setAdminOpen(null); useSession(null); setSession(null); };
    window.addEventListener("outreach:locked", onLock); return () => window.removeEventListener("outreach:locked", onLock);
  }, [slug]);

  const enter = (s: OxSession, remember: boolean) => { if (remember) saveSession(s); else setAdminOpen(s); useSession(s); setSession(s); nav(`/outreach/${s.slug}${window.location.search}`); };
  const leave = () => { if (slug) forgetSession(slug); setAdminOpen(null); useSession(null); setSession(null); nav("/outreach"); };

  if (slug && session) return <Workspace key={session.id} session={session} onLeave={leave} />;
  return <Gate slug={slug} onEnter={enter} />;
}

function Gate({ slug, onEnter }: { slug: string; onEnter: (s: OxSession, remember: boolean) => void }) {
  const [list, setList] = useState<Listing | null>(null);
  const [known, setKnown] = useState<{ id: number; slug: string; name: string } | null>(null);
  const [addr, setAddr] = useState(slug), [pass, setPass] = useState("");
  const [create, setCreate] = useState({ name: "", password: "", adopt: true });
  const [showCreate, setShowCreate] = useState(false);
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { api<Listing>("/api/outreach/workspaces").then(setList).catch(() => {}); }, []);
  useEffect(() => { setAddr(slug); setErr(""); setKnown(null); if (slug) api<{ id: number; slug: string; name: string }>(`/api/outreach/w/${encodeURIComponent(slug)}`).then(setKnown).catch(() => {}); }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const s = addr.trim().toLowerCase().replace(/^.*\/outreach\//, "");
      const r = await api<{ token: string; workspace: { id: number; slug: string; name: string } }>("/api/outreach/enter", { method: "POST", body: JSON.stringify({ slug: s, password: pass }) });
      onEnter({ ...r.workspace, token: r.token }, true);
    } catch (x) { setErr(errText(x, "Couldn't enter.")); } finally { setBusy(false); }
  }
  async function make(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await api<{ token: string; workspace: { id: number; slug: string; name: string } }>("/api/outreach/workspaces", { method: "POST", body: JSON.stringify({ name: create.name, password: create.password, adoptLegacy: create.adopt && !!list?.legacy }) });
      onEnter({ ...r.workspace, token: r.token }, true);
    } catch (x) { setErr(x instanceof ApiError ? x.message : errText(x, "Couldn't create.")); } finally { setBusy(false); }
  }
  const saved = allSessions();

  return (
    <div className="ox-gate">
      <h1>Outreach</h1>
      <p className="ox-dim">A shared desk for one artist's calls, contacts and mail. Enter the address and password you were given.</p>
      {saved.length > 0 && !slug && <ul className="ox-gate-list">{saved.map((s) => <li key={s.slug}><Link className="btn" to={`/outreach/${s.slug}`}>{s.name}</Link></li>)}</ul>}
      <form onSubmit={submit} className="ox-gate-form">
        {slug ? <h2>{known?.name ?? slug}</h2> : <label>Address<input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="artist-name" autoCapitalize="none" required /></label>}
        <label>Password<input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" autoFocus required /></label>
        <button className="btn btn-primary" disabled={busy}>{busy ? "…" : "Enter"}</button>
      </form>
      {list?.admin && list.workspaces.length > 0 && (
        <section><h2>Workspaces</h2><p className="ox-hint">You are the site's admin: no password needed.</p>
          <ul className="ox-gate-list">{list.workspaces.map((w) => <li key={w.id}><button className="btn" onClick={() => onEnter({ ...w, token: "" }, false)}>{w.name}</button> <small className="ox-dim">/outreach/{w.slug}</small></li>)}</ul>
        </section>
      )}
      {list?.canCreate && (
        <section>
          {!showCreate ? <button className="btn" onClick={() => setShowCreate(true)}>＋ New workspace</button> : (
            <form onSubmit={make} className="ox-gate-form">
              <h2>New workspace</h2>
              <label>Artist name<input value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} maxLength={60} required /></label>
              <label>Password (8+, share it with the people who manage this artist)<input type="password" value={create.password} onChange={(e) => setCreate({ ...create, password: e.target.value })} minLength={8} autoComplete="new-password" required /></label>
              {list.legacy > 0 && <label className="ox-check"><input type="checkbox" checked={create.adopt} onChange={(e) => setCreate({ ...create, adopt: e.target.checked })} /> Move my existing Outreach data in here ({list.legacy} items)</label>}
              <button className="btn btn-primary" disabled={busy}>Create</button>
            </form>
          )}
        </section>
      )}
      {err && <p className="ox-err" role="alert">{err}</p>}
    </div>
  );
}

function Workspace({ session, onLeave }: { session: OxSession; onLeave: () => void }) {
  const [st, setSt] = useState<OutreachState | null>(null);
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<"" | "mail" | "ws" | "inbox" | "past" | "files">("");
  const [tick, setTick] = useState(0);
  const [followReq, setFollowReq] = useState<{ id: number; tick: number } | null>(null);
  const [params, setParams] = useSearchParams();
  const [captureUrl, setCaptureUrl] = useState(() => params.get("capture") ?? "");
  const timers = useRef(new Map<number, number>());

  const load = useCallback(() => api<OutreachState>("/api/outreach/state").then(setSt).catch((e) => setErr(errText(e, "Couldn't load."))), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { document.title = `${session.name} · Outreach`; }, [session.name]);
  useEffect(() => { if (params.has("capture")) { const p = new URLSearchParams(params); p.delete("capture"); setParams(p, { replace: true }); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const patchContacts = (fn: (c: Contact[]) => Contact[]) => setSt((s) => (s ? { ...s, contacts: fn(s.contacts) } : s));

  // Edits show at once and save in the background; a failed save reloads the truth.
  const onPatch = useCallback((id: number, p: Patch) => {
    patchContacts((cs) => cs.map((c) => {
      if (c.id !== id) return c;
      const { set, ...rest } = p; const next: Contact = { ...c, ...rest } as Contact;
      if (rest.status && ["replied", "accepted", "declined"].includes(rest.status)) next.followUpAt = null;
      if (set) { next.data = { ...c.data }; for (const [k, v] of Object.entries(set)) { if (v === null || v === "" || v === false) delete next.data[k]; else next.data[k] = v; } }
      return next;
    }));
    const prev = timers.current.get(id); if (prev) window.clearTimeout(prev);
    // typing in a number box fires every keystroke: wait a beat so one edit is one request
    const body = JSON.stringify(p);
    timers.current.set(id, window.setTimeout(() => {
      api<Contact>(`/api/outreach/contacts/${id}`, { method: "PATCH", body }).then((c) => patchContacts((cs) => cs.map((x) => (x.id === id ? c : x)))).catch((e) => { setErr(errText(e, "Couldn't save.")); load(); });
    }, p.sentCount !== undefined ? 450 : 0));
  }, [load]);

  const onAdd = useCallback(async () => { const c = await api<Contact>("/api/outreach/contacts", { method: "POST", body: JSON.stringify({}) }); patchContacts((cs) => [...cs, c]); }, []);
  const onDelete = useCallback(async (ids: number[]) => { await api("/api/outreach/contacts/delete", { method: "POST", body: JSON.stringify({ ids }) }); patchContacts((cs) => cs.filter((c) => !ids.includes(c.id))); setSelected(new Set()); }, []);
  const onGroups = useCallback((groups: Group[], removedId?: number) => {
    setSt((s) => (s ? { ...s, groups, contacts: removedId === undefined ? s.contacts : s.contacts.map((c) => (c.groups.includes(removedId) ? { ...c, groups: c.groups.filter((g) => g !== removedId) } : c)) } : s));
  }, []);
  const onMembers = useCallback(async (groupId: number, ids: number[], add: boolean) => {
    await api(`/api/outreach/groups/${groupId}/members`, { method: "POST", body: JSON.stringify(add ? { add: ids } : { remove: ids }) });
    const set = new Set(ids);
    patchContacts((cs) => cs.map((c) => (set.has(c.id) ? { ...c, groups: add ? (c.groups.includes(groupId) ? c.groups : [...c.groups, groupId]) : c.groups.filter((g) => g !== groupId) } : c)));
  }, []);
  const onFollowUp = useCallback((id: number) => { setSelected(new Set([id])); setFollowReq((r) => ({ id, tick: (r?.tick ?? 0) + 1 })); setTick((t) => t + 1); }, []);
  const onStatus = useCallback((id: number, status: string) => onPatch(id, { status }), [onPatch]);
  const onWrite = useCallback((ids: number[]) => { setSelected(new Set(ids)); setTick((t) => t + 1); }, []);
  const onColumns = useCallback((columns: Col[], reload: boolean) => { setSt((s) => (s ? { ...s, columns } : s)); if (reload) load(); }, [load]);

  if (!st) return <div className="ox-page"><h1>Outreach</h1>{err ? <p className="ox-err">{err} <button className="btn-link" onClick={onLeave}>back</button></p> : <p className="ox-dim">Loading…</p>}</div>;
  const dueCount = st.contacts.reduce((n, c) => n + (c.followUpAt && c.followUpAt <= st.today ? 1 : 0), 0);
  const setWs = (w: WorkspaceInfo) => setSt((s) => (s ? { ...s, workspace: w } : s));
  const needsMail = !st.accounts.some((a) => a.hasPassword);

  return (
    <div className="ox-page">
      <header className="ox-head">
        <h1>{st.workspace.name}</h1>
        {dueCount > 0 && <span className="ox-duechip" title="Contacts whose follow-up date has come">{dueCount} follow-up{dueCount === 1 ? "" : "s"} due</span>}
        <span className="ox-spacer" />
        <button className="btn" onClick={() => setModal("inbox")} title="Calls found by the bookmarklet, feeds and pasted newsletters">New{st.newLeads > 0 ? ` (${st.newLeads})` : ""}</button>
        <button className="btn" onClick={() => setModal("past")}>Past mail</button>
        <button className="btn" onClick={() => setModal("files")}>Files</button>
        <button className="btn" onClick={() => setModal("mail")}>Mailboxes{needsMail && <span className="admin-nav-pending-dot" title="Not set up yet" />}</button>
        <button className="btn" onClick={() => setModal("ws")}>Workspace</button>
        <button className="btn" onClick={onLeave} title="Forget the password on this device">Leave</button>
      </header>
      {err && <p className="ox-err" role="alert">{err} <button className="btn-link" onClick={() => setErr("")}>dismiss</button></p>}
      <TodayPanel contacts={st.contacts} groups={st.groups} columns={st.columns} today={st.today} quietAfter={st.quietAfter} profile={st.workspace.profile} onWrite={onWrite} onFollowUp={onFollowUp} onStatus={onStatus} onSnooze={(id, until, reason) => onPatch(id, { followUpAt: until, snoozeReason: reason })} />
      <ContactSheet cols={st.columns} contacts={st.contacts} groups={st.groups} onGroups={onGroups} onMembers={onMembers} today={st.today} selected={selected} setSelected={setSelected} profile={st.workspace.profile} initialCapture={captureUrl} onCaptureDone={() => setCaptureUrl("")}
        onPatch={onPatch} onAdd={onAdd} onDelete={onDelete} onWrite={onWrite} onColumns={onColumns} onImported={load} onCaptured={(c) => { patchContacts((cs) => [...cs, c]); load(); }} onMerged={load} />
      <Composer workspaceId={st.workspace.id} accounts={st.accounts} columns={st.columns} contacts={st.contacts} groups={st.groups} templates={st.templates} onTemplates={(t: Template[]) => setSt((s) => (s ? { ...s, templates: t } : s))} scheduled={st.scheduled} followUpReq={followReq} selected={selected} setSelected={setSelected}
        blockTypes={st.blockTypes} onBlockTypes={(t: BlockType[]) => setSt((s) => (s ? { ...s, blockTypes: t } : s))} today={st.today} onSent={load} preselectTick={tick} />
      <ResultsPanel profile={st.workspace.profile} contacts={st.contacts} columns={st.columns} today={st.today} />
      {modal === "mail" && <SettingsModal accounts={st.accounts} onChange={(a: OutreachSettings[]) => setSt((x) => (x ? { ...x, accounts: a } : x))} onClose={() => setModal("")} />}
      {modal === "ws" && <WorkspaceModal ws={st.workspace} onChange={setWs} onClose={() => setModal("")} onLeave={onLeave} />}
      {modal === "inbox" && <InboxModal slug={st.workspace.slug} onKept={(cs) => { patchContacts((x) => [...x, ...cs]); load(); }} onCount={(n) => setSt((x) => (x ? { ...x, newLeads: n } : x))} onClose={() => setModal("")} />}
      {modal === "past" && <MessagesModal blockTypes={st.blockTypes} contacts={st.contacts} onBlocks={(t) => setSt((x) => (x ? { ...x, blockTypes: t } : x))} onImported={load} onStatus={onStatus} onClose={() => setModal("")} />}
      {modal === "files" && <FilesModal mode="manage" groups={st.groups} attachRules={st.workspace.attachRules} onAttachRules={(r: AttachRule[]) => { setWs({ ...st.workspace, attachRules: r }); }} onClose={() => setModal("")} />}
    </div>
  );
}
