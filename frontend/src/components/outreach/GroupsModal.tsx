import { useState } from "react";
import { api } from "../../lib/api";
import type { Contact, Group } from "./types";

export function GroupsModal({ groups, contacts, onChange, onClose }: { groups: Group[]; contacts: Contact[]; onChange: (g: Group[], removedId?: number) => void; onClose: () => void }) {
  const [name, setName] = useState(""); const [err, setErr] = useState("");
  const run = async (f: () => Promise<void>) => { setErr(""); try { await f(); } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong."); } };
  const count = (id: number) => contacts.reduce((n, c) => n + (c.groups.includes(id) ? 1 : 0), 0);
  const add = () => run(async () => { if (!name.trim()) return; const g = await api<Group>("/api/outreach/groups", { method: "POST", body: JSON.stringify({ name }) }); onChange([...groups, g]); setName(""); });
  const rename = (g: Group) => run(async () => {
    const n = prompt("Rename the group", g.name)?.trim(); if (!n || n === g.name) return;
    const out = await api<Group>(`/api/outreach/groups/${g.id}`, { method: "PATCH", body: JSON.stringify({ name: n }) }); onChange(groups.map((x) => (x.id === g.id ? out : x)));
  });
  const del = (g: Group) => run(async () => {
    if (!confirm(`Delete the group "${g.name}"? The ${count(g.id)} contact(s) in it stay in your list.`)) return;
    await api(`/api/outreach/groups/${g.id}`, { method: "DELETE" }); onChange(groups.filter((x) => x.id !== g.id), g.id);
  });
  return (
    <div className="ox-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ox-modal" role="dialog" aria-label="Groups">
        <header><h2>Groups</h2><button className="btn" onClick={onClose} aria-label="Close">✕</button></header>
        <p className="ox-hint">Put contacts in groups (Festivals, Open calls, Labels…) from the Groups column, or tick contacts and use <b>Add to group</b>. A contact can be in several. Filter or sort by group in the list, then write to everyone you filtered.</p>
        <ul className="ox-collist">
          {groups.map((g) => (
            <li key={g.id}><div className="ox-colrow"><b>{g.name}</b><span className="ox-dim">{count(g.id)} contact{count(g.id) === 1 ? "" : "s"}</span>
              <span className="ox-colbtns"><button className="btn" onClick={() => rename(g)}>Rename</button><button className="btn btn-danger" onClick={() => del(g)}>Delete</button></span></div></li>
          ))}
          {groups.length === 0 && <li className="ox-dim">No groups yet.</li>}
        </ul>
        <div className="ox-addcol"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="New group, e.g. Festivals 2027" onKeyDown={(e) => { if (e.key === "Enter") add(); }} /><button className="btn btn-primary" onClick={add} disabled={!name.trim()}>Add group</button></div>
        {err && <p className="ox-err" role="alert">{err}</p>}
      </div>
    </div>
  );
}
