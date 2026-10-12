import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { Composer } from "../../components/outreach/Composer";
import { ContactSheet } from "../../components/outreach/ContactSheet";
import { SettingsModal } from "../../components/outreach/SettingsModal";
import type { BlockType, CellValue, Col, Contact, OutreachSettings, OutreachState } from "../../components/outreach/types";

type Patch = { name?: string; email?: string; set?: Record<string, CellValue>; lastSentAt?: string | null; sentCount?: number; followUpAt?: string | null };

export function OutreachAdminPage() {
  const [st, setSt] = useState<OutreachState | null>(null);
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const timers = useRef(new Map<number, number>());

  const load = useCallback(() => api<OutreachState>("/api/admin/outreach/state").then(setSt).catch((e) => setErr(e instanceof Error ? e.message : "Couldn't load.")), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { document.title = "Outreach · Exomusica"; }, []);

  const patchContacts = (fn: (c: Contact[]) => Contact[]) => setSt((s) => (s ? { ...s, contacts: fn(s.contacts) } : s));

  // Edits show at once and save in the background; a failed save reloads the truth.
  const onPatch = useCallback((id: number, p: Patch) => {
    patchContacts((cs) => cs.map((c) => {
      if (c.id !== id) return c;
      const { set, ...rest } = p; const next: Contact = { ...c, ...rest };
      if (set) { next.data = { ...c.data }; for (const [k, v] of Object.entries(set)) { if (v === null || v === "" || v === false) delete next.data[k]; else next.data[k] = v; } }
      return next;
    }));
    const prev = timers.current.get(id); if (prev) window.clearTimeout(prev);
    // typing in a number box fires every keystroke: wait a beat so one edit is one request
    const body = JSON.stringify(p);
    timers.current.set(id, window.setTimeout(() => {
      api<Contact>(`/api/admin/outreach/contacts/${id}`, { method: "PATCH", body }).then((c) => patchContacts((cs) => cs.map((x) => (x.id === id ? c : x)))).catch((e) => { setErr(e instanceof Error ? e.message : "Couldn't save."); load(); });
    }, p.sentCount !== undefined ? 450 : 0));
  }, [load]);

  const onAdd = useCallback(async () => {
    const c = await api<Contact>("/api/admin/outreach/contacts", { method: "POST", body: JSON.stringify({}) });
    patchContacts((cs) => [...cs, c]);
  }, []);
  const onDelete = useCallback(async (ids: number[]) => {
    await api("/api/admin/outreach/contacts/delete", { method: "POST", body: JSON.stringify({ ids }) });
    patchContacts((cs) => cs.filter((c) => !ids.includes(c.id))); setSelected(new Set());
  }, []);
  const onWrite = useCallback((ids: number[]) => { setSelected(new Set(ids)); setTick((t) => t + 1); }, []);
  const onColumns = useCallback((columns: Col[], reload: boolean) => { setSt((s) => (s ? { ...s, columns } : s)); if (reload) load(); }, [load]);

  if (!st) return <div><h1>Outreach</h1>{err ? <p className="ox-err">{err}</p> : <p className="ox-dim">Loading…</p>}</div>;
  const dueCount = st.contacts.reduce((n, c) => n + (c.followUpAt && c.followUpAt <= st.today ? 1 : 0), 0);

  return (
    <div className="ox-page">
      <header className="ox-head">
        <h1>Outreach</h1>
        {dueCount > 0 && <span className="ox-duechip" title="Contacts whose follow-up date has come">{dueCount} follow-up{dueCount === 1 ? "" : "s"} due</span>}
        <span className="ox-spacer" />
        <button className="btn" onClick={() => setSettingsOpen(true)}>Mail settings{!st.settings.hasPassword && <span className="admin-nav-pending-dot" title="Not set up yet" />}</button>
      </header>
      {err && <p className="ox-err" role="alert">{err} <button className="btn-link" onClick={() => setErr("")}>dismiss</button></p>}
      <ContactSheet cols={st.columns} contacts={st.contacts} today={st.today} selected={selected} setSelected={setSelected}
        onPatch={onPatch} onAdd={onAdd} onDelete={onDelete} onWrite={onWrite} onColumns={onColumns} onImported={load} />
      <Composer settings={st.settings} columns={st.columns} contacts={st.contacts} selected={selected} setSelected={setSelected}
        blockTypes={st.blockTypes} onBlockTypes={(t: BlockType[]) => setSt((s) => (s ? { ...s, blockTypes: t } : s))} today={st.today} onSent={load} preselectTick={tick} />
      {settingsOpen && <SettingsModal settings={st.settings} onSaved={(s: OutreachSettings) => setSt((x) => (x ? { ...x, settings: s } : x))} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
