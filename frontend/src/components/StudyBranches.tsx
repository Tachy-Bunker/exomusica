import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useHome } from "../lib/home";

/** The branches a study is about (none, one or several): shown under each branch in Explore and Soundbay. The owner edits them here. */
export function StudyBranches({ studySlug, linked, canEdit, onChange }: { studySlug: string; linked: { slug: string; name: string }[]; canEdit: boolean; onChange: () => void }) {
  const { home } = useHome();
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api(`/api/studies/${studySlug}`, { method: "PATCH", body: JSON.stringify({ branchSlugs: picked }) });
      setEditing(false);
      onChange();
    } finally { setSaving(false); }
  }
  if (!canEdit && linked.length === 0) return null;
  return (
    <div className="study-branches" data-testid="study-branches">
      <span className="home-dim">Branches: </span>
      {linked.length === 0 && <span className="home-dim">none</span>}
      {linked.map((b, i) => <span key={b.slug}>{i > 0 && ", "}<Link to={`/soundbay?open=${b.slug}`}>{b.name}</Link></span>)}
      {canEdit && !editing && <> · <button type="button" className="link-btn" onClick={() => { setPicked(linked.map((b) => b.slug)); setEditing(true); }} data-testid="study-edit-branches">edit</button></>}
      {editing && (
        <div className="study-branch-picker">
          <div className="xl-chips" role="group" aria-label="Branches this study is about">
            {(home?.branches ?? []).map((b) => (
              <button key={b.slug} type="button" className={`xl-chip${picked.includes(b.slug) ? " on" : ""}`} aria-pressed={picked.includes(b.slug)} onClick={() => setPicked((p) => (p.includes(b.slug) ? p.filter((x) => x !== b.slug) : [...p, b.slug]))}>{b.name}</button>
            ))}
          </div>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>Save</button> <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
