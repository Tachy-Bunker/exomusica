import { memo, useCallback, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { fitScore } from "../../lib/fit";
import { fmtKm, mapLinks, nearest, parseLatLng, type LatLng } from "../../lib/geo";
import { toIcs } from "../../lib/ics";
import { parseSnooze } from "../../lib/today";
import { exportRows, filterContacts, isDue, relDay, sortContacts, toCsv, toJson } from "../../lib/outreachSheet";
import { normalizeContactsCsv, toVcf, vcfToCsv } from "../../lib/vcard";
import { zipName, zipStore } from "../../lib/zip";
import { CaptureModal } from "./CaptureModal";
import { Cell, DateInput, MultiPick, TextCell } from "./Cells";
import { ResizeGrip } from "./ResizeGrip";
import { GroupsModal } from "./GroupsModal";
import { ColumnsModal } from "./ColumnsModal";
import { MergeModal } from "./MergeModal";
import { STATUS_LABEL, STATUS_ORDER, type CellValue, type Col, type Contact, type FitProfile, type Group } from "./types";

const ZONES: string[] = (() => { try { return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? []; } catch { return []; } })();

type Patch = { status?: string; deadline?: string | null; timezone?: string; groups?: number[]; name?: string; email?: string; set?: Record<string, CellValue>; lastSentAt?: string | null; sentCount?: number; followUpAt?: string | null; place?: string; lat?: number | null; lng?: number | null; doNotContact?: boolean; snoozeReason?: string; declineReason?: string; reopensAt?: string | null };
const PAGE = 150;

function download(name: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const Row = memo(function Row({ c, cols, groups, today, on, cursor, fit, km, showFit, onPatch, onWrite, onToggle, onPlace, onSnooze }: {
  c: Contact; cols: Col[]; groups: Group[]; today: string; on: boolean; cursor: boolean; fit: number | null; km: number | null; showFit: boolean; onPatch: (id: number, p: Patch) => void; onWrite: (id: number) => void; onToggle: (id: number) => void; onPlace: (id: number, v: string) => void; onSnooze: (id: number) => void;
}) {
  const map = mapLinks(c);
  const due = isDue(c, today);
  const set = useCallback((key: string, v: CellValue) => onPatch(c.id, { set: { [key]: v } }), [c.id, onPatch]);
  return (
    <tr className={(on ? "sel " : "") + (due ? "due " : "") + (cursor ? "cur " : "") + (c.doNotContact ? "dnc" : "")} data-testid="contact-row" data-id={c.id}>
      <td className="ox-sticky0"><input type="checkbox" checked={on} onChange={() => onToggle(c.id)} aria-label={`Select ${c.name || c.email}`} /></td>
      <td className="ox-sticky1"><TextCell type="text" value={c.name} placeholder="Name" onSave={(v) => onPatch(c.id, { name: v })} /></td>
      <td><TextCell type="email" value={c.email} placeholder="email@…" onSave={(v) => onPatch(c.id, { email: v })} /></td>
      <td className="t-multiselect"><MultiPick options={groups.map((g) => g.name)} value={c.groups.map((id) => groups.find((g) => g.id === id)?.name).filter((x): x is string => !!x)} onSave={(names) => onPatch(c.id, { groups: names.flatMap((n) => groups.filter((g) => g.name === n).map((g) => g.id)) })} /></td>
      <td><select className={"ox-cell-input ox-st ox-st-" + (c.status || "none")} value={c.status} onChange={(e) => onPatch(c.id, { status: e.target.value })} aria-label="Status"><option value="">—</option>{STATUS_ORDER.map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}</select></td>
      <td className="ox-sent"><DateInput className={"ox-cell-input" + (c.deadline && c.deadline < today && !["accepted", "declined", "replied"].includes(c.status) ? " due" : "")} label="Deadline" value={c.deadline ?? ""} onSave={(v) => onPatch(c.id, { deadline: v || null })} /><small className={c.deadline && c.deadline < today ? "ox-dim" : "ox-dim"}>{relDay(today, c.deadline)}</small></td>
      <td className="ox-place"><div className="ox-linkcell"><TextCell type="text" value={c.place} placeholder="City, country" onSave={(v) => onPlace(c.id, v)} />{map && <a href={map.google} target="_blank" rel="noreferrer" title={c.lat !== null ? `${c.lat.toFixed(4)}, ${c.lng?.toFixed(4)}: open in maps` : "Open in maps"} aria-label={`Map of ${c.place || c.name}`}>📍</a>}</div>{km !== null && <small className="ox-dim">{fmtKm(km)}</small>}</td>
      {showFit && <td className="ox-fit">{fit !== null && <span className={"ox-fitpill " + (fit >= 70 ? "hi" : fit < 40 ? "lo" : "")}>{fit}</span>}</td>}
      {cols.map((col) => <td key={col.id} className={"t-" + col.type}><Cell col={col} value={c.data[col.key]} onSet={set} /></td>)}
      <td className="ox-sent">
        <DateInput className="ox-cell-input" label="Last sent" value={c.lastSentAt ?? ""} onSave={(v) => onPatch(c.id, { lastSentAt: v || null })} />
        <small className="ox-dim">{relDay(today, c.lastSentAt)}</small>
      </td>
      <td className="ox-count"><input type="number" min={0} max={9999} className="ox-cell-input" value={c.sentCount} onChange={(e) => onPatch(c.id, { sentCount: Number(e.target.value) || 0 })} aria-label="Times sent" /></td>
      <td className="ox-sent">
        <DateInput className={"ox-cell-input" + (due ? " due" : "")} label="Follow up" value={c.followUpAt ?? ""} onSave={(v) => onPatch(c.id, { followUpAt: v || null })} />
        <small className={due ? "ox-due" : "ox-dim"}>{relDay(today, c.followUpAt)}</small>
      </td>
      <td className="ox-sent"><DateInput className="ox-cell-input" label="Opens again" value={c.reopensAt ?? ""} onSave={(v) => onPatch(c.id, { reopensAt: v || null })} /></td>
      <td><TextCell type="text" list="ox-tzs" value={c.timezone} placeholder="Europe/Paris" onSave={(v) => onPatch(c.id, { timezone: v })} /></td>
      <td className="ox-acts"><button className="btn" onClick={() => onSnooze(c.id)} title="Push the reminder back, with a reason" aria-label={`Snooze ${c.name || c.email}`}>⏰</button><button className={"btn" + (c.doNotContact ? " active" : "")} onClick={() => onPatch(c.id, { doNotContact: !c.doNotContact })} title={c.doNotContact ? "Do not contact: click to allow mail again" : "Never mail this address"} aria-pressed={c.doNotContact} aria-label="Do not contact">⛔</button>{c.sentCount > 0 && !["replied", "accepted", "declined"].includes(c.status) && <button className="btn" onClick={() => onPatch(c.id, { status: "replied" })} title="They answered: stops the follow-up reminder" aria-label={`Mark ${c.name || c.email} as replied`}>↩</button>}<button className="btn ox-write" onClick={() => onWrite(c.id)} title={c.email ? `Write to ${c.name || c.email}` : "Add an email address first"} disabled={!c.email} aria-label={`Write to ${c.name || c.email}`}>✉</button></td>
    </tr>
  );
});

export function ContactSheet({ cols, contacts, groups, onGroups, onMembers, today, selected, setSelected, profile, initialCapture, onCaptureDone, onPatch: onPatchRaw, onAdd, onDelete, onWrite, onColumns, onImported, onCaptured, onMerged }: {
  onCaptured: (c: Contact) => void; onMerged: () => void; profile: Partial<FitProfile>; initialCapture: string; onCaptureDone: () => void;
  groups: Group[]; onGroups: (g: Group[], removedId?: number) => void; onMembers: (groupId: number, ids: number[], add: boolean) => Promise<void>;
  cols: Col[]; contacts: Contact[]; today: string; selected: Set<number>; setSelected: (s: Set<number>) => void;
  onPatch: (id: number, p: Patch) => void; onAdd: () => Promise<void>; onDelete: (ids: number[]) => Promise<void>; onWrite: (ids: number[]) => void;
  onColumns: (cols: Col[], reload: boolean) => void; onImported: () => void;
}) {
  const [q, setQ] = useState(""), [dueOnly, setDue] = useState(false), [never, setNever] = useState(false);
  const [sort, setSort] = useState<{ key: string | null; dir: 1 | -1 }>({ key: null, dir: 1 });
  const [shown, setShown] = useState(PAGE);
  const [colModal, setColModal] = useState<{ id: number | null } | null>(null);
  const [groupFilter, setGroupFilter] = useState<number | "none" | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(!!initialCapture);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [nearOpen, setNearOpen] = useState(false);
  const [near, setNear] = useState<{ label: string; at: LatLng; radius: number } | null>(null);
  const [nearIn, setNearIn] = useState({ q: "", radius: 0 });
  const [cursor, setCursor] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const visibleCols = useMemo(() => cols.filter((c) => !c.hidden), [cols]);
  const hasProfile = !!(profile.keywords?.length || profile.avoid?.length || profile.regions?.length || profile.maxFee != null || profile.homeLat != null);
  const fitMap = useMemo(() => { const m = new Map<number, number>(); if (hasProfile) for (const c of contacts) m.set(c.id, fitScore(c, cols, profile, today).score); return m; }, [contacts, cols, profile, today, hasProfile]);
  const kmMap = useMemo(() => { const m = new Map<number, number>(); if (near) for (const x of nearest(contacts, near.at)) m.set(x.item.id, x.km); return m; }, [contacts, near]);
  const rows = useMemo(() => {
    let base = filterContacts(contacts, cols, { q, due: dueOnly, never, group: groupFilter, status: statusFilter }, today);
    if (near) base = base.filter((c) => { const k = kmMap.get(c.id); return k !== undefined && (near.radius === 0 || k <= near.radius); });
    const virt = { fit: (c: Contact) => fitMap.get(c.id) ?? null, km: (c: Contact) => kmMap.get(c.id) ?? null };
    return sortContacts(base, cols, near && !sort.key ? "km" : sort.key, sort.key ? sort.dir : 1, groups, virt);
  }, [contacts, cols, q, dueOnly, never, today, sort, groupFilter, groups, statusFilter, near, kmMap, fitMap]);
  const noCoords = useMemo(() => (near ? contacts.filter((c) => c.lat === null && c.place).length : 0), [contacts, near]);
  const dueCount = useMemo(() => contacts.reduce((n, c) => n + (isDue(c, today) ? 1 : 0), 0), [contacts, today]);
  const page = rows.slice(0, shown);
  const allOn = page.length > 0 && page.every((c) => selected.has(c.id));

  const selRef = useRef(selected); selRef.current = selected;
  const toggle = useCallback((id: number) => { const s = new Set(selRef.current); if (s.has(id)) s.delete(id); else s.add(id); setSelected(s); }, [setSelected]);
  const writeOne = useCallback((id: number) => onWrite([id]), [onWrite]);
  const th = (key: string, label: string, cls = "") => (
    <th className={cls} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button className="ox-th" onClick={() => setSort((s) => (s.key === key ? (s.dir === 1 ? { key, dir: -1 } : { key: null, dir: 1 }) : { key, dir: 1 }))}>{label}{sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</button>
    </th>
  );

  async function importFile(f: File | undefined) {
    if (!f) return; setNote("Importing…");
    try {
      const raw = await f.text();
      const isCard = /\.(vcf|vcard)$/i.test(f.name) || /^\s*BEGIN:VCARD/i.test(raw);
      const card = isCard ? vcfToCsv(raw) : null; const csv = card ? card.csv : normalizeContactsCsv(raw).csv;
      const r = await api<{ added: number; skipped: number; newColumns: string[]; newGroups: string[] }>("/api/outreach/contacts/import", { method: "POST", body: JSON.stringify({ csv, hints: card?.hints }) });
      setNote(`Added ${r.added} contact${r.added === 1 ? "" : "s"}${r.newColumns.length ? `, new columns: ${r.newColumns.join(", ")}` : ""}${r.newGroups?.length ? `, new groups: ${r.newGroups.join(", ")}` : ""}${r.skipped ? `, skipped ${r.skipped} empty row${r.skipped === 1 ? "" : "s"}` : ""}.`);
      onImported();
    } catch (e) { setNote(e instanceof Error ? e.message : "Import failed."); }
    if (file.current) file.current.value = "";
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const gname = (id: number) => groups.find((g) => g.id === id)?.name;
  function downloadZip(list: Contact[]) {
    const taken = new Set<string>(), enc = new TextEncoder();
    const files = list.filter((c) => c.name || c.email).map((c) => ({ name: zipName(c.name || c.email, ".vcf", taken), data: enc.encode(toVcf([c], cols, gname)) }));
    if (!files.length) { setNote("Nothing to export."); return; }
    const url = URL.createObjectURL(new Blob([zipStore(files) as BlobPart], { type: "application/zip" }));
    const a = document.createElement("a"); a.href = url; a.download = `contact-cards-${stamp}.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const onPatch = useCallback((id: number, p: Patch) => {
    if (p.status === "declined") { const r = prompt("Why did they decline? (a few words, optional: “fee”, “not a fit”, “too late”…)"); if (r && r.trim()) p = { ...p, declineReason: r.trim().slice(0, 120) }; }
    onPatchRaw(id, p);
  }, [onPatchRaw]);
  const onPlace = useCallback(async (id: number, v: string) => {
    const ll = parseLatLng(v);
    if (ll || !v.trim()) { onPatchRaw(id, { place: v.trim(), lat: ll?.lat ?? null, lng: ll?.lng ?? null }); return; }
    onPatchRaw(id, { place: v.trim(), lat: null, lng: null });
    try { const g = await api<{ lat: number; lng: number }>("/api/outreach/geocode", { method: "POST", body: JSON.stringify({ q: v }) }); onPatchRaw(id, { lat: g.lat, lng: g.lng }); }
    catch { setNote(`“${v}” has no coordinates yet: try a bigger place name or type 48.85, 2.35.`); }
  }, [onPatchRaw]);
  const onSnooze = useCallback((id: number) => {
    const v = prompt("Snooze until when? (3d, 2w, or 2026-12-01). Add a reason after: “2w - waiting for their jury”", "1w"); if (!v) return;
    const r = parseSnooze(v, today); onPatchRaw(id, { followUpAt: r.until, snoozeReason: r.reason });
  }, [onPatchRaw, today]);
  async function runNear(e?: React.FormEvent) {
    e?.preventDefault(); const q = nearIn.q.trim(); if (!q) return;
    const ll = parseLatLng(q);
    if (ll) { setNear({ label: `${ll.lat.toFixed(3)}, ${ll.lng.toFixed(3)}`, at: ll, radius: nearIn.radius }); return; }
    try { const g = await api<{ lat: number; lng: number; label?: string }>("/api/outreach/geocode", { method: "POST", body: JSON.stringify({ q }) }); setNear({ label: g.label ?? q, at: { lat: g.lat, lng: g.lng }, radius: nearIn.radius }); setNote(""); }
    catch (x) { setNote(x instanceof Error ? x.message : "Couldn't find that place."); }
  }
  function useMyPlace() {
    if (!navigator.geolocation) { setNote("This browser can't give a location."); return; }
    navigator.geolocation.getCurrentPosition((p) => setNear({ label: "where I am", at: { lat: p.coords.latitude, lng: p.coords.longitude }, radius: nearIn.radius }), () => setNote("Location was refused."), { timeout: 8000 });
  }
  const downloadIcs = () => { const ics = toIcs(contacts); if (!ics.includes("BEGIN:VEVENT")) { setNote("No deadlines or follow-ups to put in a calendar."); return; } download(`outreach-${stamp}.ics`, "text/calendar;charset=utf-8", ics); };

  // keyboard flow (not while typing): j/k move, x selects, w writes, r = replied, s snoozes, / searches
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement; if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName) || t.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
    const idx = cursor === null ? -1 : page.findIndex((c) => c.id === cursor); const cur = idx >= 0 ? page[idx] : null;
    const move = (d: number) => { const n = page[Math.max(0, Math.min(page.length - 1, idx + d))]; if (n) { setCursor(n.id); requestAnimationFrame(() => document.querySelector(`tr[data-id="${n.id}"]`)?.scrollIntoView({ block: "nearest" })); } };
    switch (e.key) {
      case "j": e.preventDefault(); move(1); break;
      case "k": e.preventDefault(); move(-1); break;
      case "x": if (cur) { e.preventDefault(); toggle(cur.id); } break;
      case "w": if (cur?.email) { e.preventDefault(); onWrite([cur.id]); } break;
      case "r": if (cur) { e.preventDefault(); onPatch(cur.id, { status: "replied" }); } break;
      case "s": if (cur) { e.preventDefault(); onSnooze(cur.id); } break;
      case "/": e.preventDefault(); searchRef.current?.focus(); break;
    }
  };
  const exportList = selected.size ? contacts.filter((c) => selected.has(c.id)) : rows;

  const scrollBox = useRef<HTMLDivElement>(null);
  return (
    <section className="ox-sheet" aria-label="Contact list" onKeyDown={onKey} tabIndex={-1}>
      <div className="ox-bar">
        <input ref={searchRef} className="ox-search" type="search" placeholder={`Search ${contacts.length} contacts…`} value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} />
        <button className={"btn" + (dueOnly ? " active" : "")} onClick={() => setDue(!dueOnly)} aria-pressed={dueOnly}>Follow-up due{dueCount ? ` (${dueCount})` : ""}</button>
        <button className={"btn" + (never ? " active" : "")} onClick={() => setNever(!never)} aria-pressed={never}>Never written to</button>
        <select className="btn" value={groupFilter === null ? "" : String(groupFilter)} onChange={(e) => { const v = e.target.value; setGroupFilter(v === "" ? null : v === "none" ? "none" : Number(v)); setShown(PAGE); }} aria-label="Filter by group">
          <option value="">All groups</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}<option value="none">No group</option>
        </select>
        <select className="btn" value={statusFilter ?? ""} onChange={(e) => { setStatusFilter(e.target.value || null); setShown(PAGE); }} aria-label="Filter by status">
          <option value="">Any status</option>{STATUS_ORDER.map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}<option value="none">No status</option>
        </select>
        <span className="ox-spacer" />
        <button className="btn btn-primary" onClick={() => setCaptureOpen(true)} title="Paste the link or text of an open call">+ Opportunity</button>
        <button className={"btn" + (near ? " active" : "")} onClick={() => setNearOpen(!nearOpen)} aria-pressed={!!near} title="Calls nearest to a city or coordinates">Near…</button>
        <button className="btn" onClick={() => setMergeOpen(true)} title="Find the same call or person twice, and merge">Duplicates</button>
        <button className="btn" onClick={() => setGroupsOpen(true)}>Groups</button>
        <button className="btn" onClick={() => setColModal({ id: null })}>Columns</button>
        <button className="btn" onClick={() => file.current?.click()} title="A CSV (also Google Contacts or Outlook exports) or a .vcf contacts file">Import</button>
        <input ref={file} type="file" accept=".csv,.vcf,.vcard,text/csv,text/vcard,text/x-vcard,text/plain" hidden onChange={(e) => importFile(e.target.files?.[0])} />
        <button className="btn" onClick={() => download(`contacts-${stamp}.csv`, "text/csv;charset=utf-8", toCsv(exportRows(exportList, cols, true, groups)))} title="Spreadsheet, including groups and send history">Export CSV</button>
        <button className="btn" onClick={() => download(`contacts-${stamp}.vcf`, "text/vcard;charset=utf-8", toVcf(exportList, cols, gname))} title="One file with every contact card: for your phone, Google / Apple Contacts, Outlook">Contacts (.vcf)</button>
        <button className="btn" onClick={() => downloadZip(exportList)} title="One .vcf card per contact, in a zip">Cards (.zip)</button>
        <button className="btn" onClick={downloadIcs} title="Deadlines and follow-ups as calendar events (.ics) for your phone or computer calendar">Calendar (.ics)</button>
        <button className="btn" onClick={() => download(`contacts-${stamp}.json`, "application/json", toJson(exportList, cols, groups))}>JSON</button>
        <button className="btn btn-primary" onClick={onAdd}>+ Contact</button>
      </div>
      {nearOpen && (
        <form className="ox-bar ox-near" onSubmit={runNear}>
          <input type="search" value={nearIn.q} onChange={(e) => setNearIn({ ...nearIn, q: e.target.value })} placeholder="City, address or 48.85, 2.35" aria-label="Near this place" autoFocus />
          <select className="btn" value={nearIn.radius} onChange={(e) => { const r = Number(e.target.value); setNearIn({ ...nearIn, radius: r }); if (near) setNear({ ...near, radius: r }); }} aria-label="Radius">
            <option value={0}>any distance</option>{[50, 200, 500, 1000, 3000].map((r) => <option key={r} value={r}>within {r} km</option>)}
          </select>
          <button className="btn btn-primary">Find nearest</button>
          <button type="button" className="btn" onClick={useMyPlace}>📍 Where I am</button>
          {near && <button type="button" className="btn" onClick={() => { setNear(null); setNearOpen(false); }}>Clear</button>}
        </form>
      )}
      {near && <p className="ox-hint" role="status">Nearest to <b>{near.label}</b>: {rows.length} with a place{near.radius ? ` within ${near.radius} km` : ""}.{noCoords > 0 && <> {noCoords} more have a place but no coordinates yet (re-save their Place).</>}</p>}
      {selected.size > 0 && (
        <div className="ox-bar ox-selbar" role="status">
          <b>{selected.size} selected</b>
          <button className="btn btn-primary" onClick={() => onWrite([...selected])}>✉ Write to them</button>
          <select className="btn" value="" aria-label="Add to group" onChange={async (e) => { const v = e.target.value; e.target.value = ""; if (!v) return; let id = Number(v);
            if (v === "new") { const n = prompt("Name the new group")?.trim(); if (!n) return; const g = await api<Group>("/api/outreach/groups", { method: "POST", body: JSON.stringify({ name: n }) }); onGroups([...groups, g]); id = g.id; }
            await onMembers(id, [...selected], true); setNote("Added to the group."); }}>
            <option value="">Add to group…</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}<option value="new">+ New group…</option>
          </select>
          {groups.length > 0 && <select className="btn" value="" aria-label="Remove from group" onChange={async (e) => { const v = Number(e.target.value); e.target.value = ""; if (v) { await onMembers(v, [...selected], false); setNote("Removed from the group."); } }}>
            <option value="">Remove from group…</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>}
          <button className="btn btn-danger" onClick={async () => { if (confirm(`Delete ${selected.size} contact${selected.size === 1 ? "" : "s"}? Their send history stays.`)) { await onDelete([...selected]); } }}>Delete</button>
          <button className="btn" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}
      {note && <p className="ox-hint" role="status">{note}</p>}
      <div className="ox-scroll" ref={scrollBox} data-testid="ox-scroll">
        <table className="ox-table">
          <thead>
            <tr>
              <th className="ox-sticky0"><input type="checkbox" checked={allOn} onChange={() => { const s = new Set(selected); if (allOn) page.forEach((c) => s.delete(c.id)); else page.forEach((c) => s.add(c.id)); setSelected(s); }} aria-label="Select all shown" /></th>
              {th("name", "Name", "ox-sticky1")}{th("email", "Email")}{th("groups", "Groups")}{th("status", "Status")}{th("deadline", "Deadline")}{th("place", "Place")}{hasProfile && th("fit", "Fit")}
              {visibleCols.map((c) => (
                <th key={c.id} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                  <button className="ox-th" onClick={() => setSort((s) => (s.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : { key: null, dir: 1 }) : { key: c.key, dir: 1 }))}>{c.name}{sort.key === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</button>
                  <button className="ox-gear" onClick={() => setColModal({ id: c.id })} aria-label={`Edit column ${c.name}`}>⚙</button>
                </th>
              ))}
              {th("lastSentAt", "Last sent")}{th("sentCount", "Times")}{th("followUpAt", "Follow up")}{th("reopensAt", "Opens again")}{th("timezone", "Time zone")}<th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {page.map((c) => <Row key={c.id} c={c} cols={visibleCols} groups={groups} today={today} on={selected.has(c.id)} cursor={cursor === c.id} fit={fitMap.get(c.id) ?? null} km={kmMap.get(c.id) ?? null} showFit={hasProfile} onPatch={onPatch} onWrite={writeOne} onToggle={toggle} onPlace={onPlace} onSnooze={onSnooze} />)}
            {rows.length === 0 && <tr><td colSpan={visibleCols.length + 14} className="ox-empty">{contacts.length === 0 ? "No contacts yet. Add one, or import a CSV exported from Google Sheets." : "Nobody matches."}</td></tr>}
          </tbody>
        </table>
      </div>
      <ResizeGrip target={scrollBox} storeKey="exomusica_ox_list_h" label="Resize the contact list" />
      {rows.length > shown && <button className="btn" onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, rows.length - shown)} more ({rows.length - shown} left)</button>}
      <datalist id="ox-tzs">{ZONES.map((z) => <option key={z} value={z} />)}</datalist>
      {captureOpen && <CaptureModal groups={groups} initialUrl={initialCapture} onAdded={onCaptured} onClose={() => { setCaptureOpen(false); onCaptureDone(); }} />}
      {mergeOpen && <MergeModal contacts={contacts} cols={cols} groups={groups} onMerged={() => { setSelected(new Set()); onMerged(); }} onClose={() => setMergeOpen(false)} />}
      {groupsOpen && <GroupsModal groups={groups} contacts={contacts} onChange={onGroups} onClose={() => setGroupsOpen(false)} />}
      {colModal && <ColumnsModal cols={cols} focusId={colModal.id} onChange={onColumns} onClose={() => setColModal(null)} />}
    </section>
  );
}
