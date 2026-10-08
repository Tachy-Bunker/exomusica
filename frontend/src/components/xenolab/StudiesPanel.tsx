import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { timeAgo } from "../../lib/relativeTime";
import { STUDY_TEMPLATES, templateById } from "../../lib/studyTemplates";
import { filterStudies, type StudyCard, type StudyFilter } from "../../lib/xenolab";
import { Username } from "../Username";

export function StudyCardView({ s }: { s: StudyCard }) {
  return (
    <li className={`xl-card${s.backgroundUrl ? " has-bg" : ""}`}>
      {s.backgroundUrl && <img className="xl-card-bg" src={s.backgroundUrl} alt="" loading="lazy" decoding="async" draggable={false} />}
      <Link className="xl-card-link" to={`/study/${s.slug}`}>
        <div className="xl-card-top">
          <b>{s.title}</b>
          <span className={`xl-status ${s.status === "COMPLETE" ? "xl-status-done" : ""}`}>{s.status === "COMPLETE" ? "complete" : "in progress"}</span>
        </div>
      </Link>
      <div className="home-dim xl-card-meta"><Username name={s.owner} /> · {timeAgo(Date.parse(s.updatedAt))}</div>
    </li>
  );
}

/** Start a study from a template, then find any study: filter, search, preview. */
export function StudiesPanel({ studies }: { studies: StudyCard[] | null }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<StudyFilter>("all");
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState("blank");
  const [shown, setShown] = useState(12);
  const [error, setError] = useState<string | null>(null);
  const template = templateById(templateId);

  async function start() {
    if (!title.trim()) { setError("Give the study a title."); return; }
    setError(null);
    try {
      const created = await api<{ slug: string }>("/api/studies", { method: "POST", body: JSON.stringify({ title: title.trim(), body: template.body }) });
      navigate(`/study/${created.slug}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the study");
    }
  }

  const list = studies ? filterStudies(studies, filter, query, user?.username ?? null) : [];
  const FILTERS: [StudyFilter, string][] = [["all", "All"], ...(user ? [["mine", "Mine"] as [StudyFilter, string]] : []), ["progress", "In progress"], ["complete", "Complete"]];

  return (
    <div data-testid="studies-panel">
      {studies === null ? <p className="home-dim">Loading…</p> : list.length === 0 ? <p className="home-dim">{studies.length === 0 ? "No studies yet. Yours could be the first." : "No study matches."}</p> : (
        <>
          <ul className="xl-cards">{list.slice(0, shown).map((s) => <StudyCardView key={s.slug} s={s} />)}</ul>
          {list.length > shown && <button className="btn" onClick={() => setShown((n) => n + 12)}>Show more ({list.length - shown})</button>}
        </>
      )}
      <div className="xl-bar">
        <div className="xl-chips" role="group" aria-label="Show">
          {FILTERS.map(([id, label]) => <button key={id} className={`xl-chip${filter === id ? " on" : ""}`} aria-pressed={filter === id} onClick={() => { setFilter(id); setShown(12); }}>{label}</button>)}
        </div>
        <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setShown(12); }} placeholder="Search studies" aria-label="Search studies" className="xl-search" />
      </div>

      <hr className="xl-sep" aria-hidden="true" />
      {user ? (
        <div className="xl-form" data-testid="xenolab-start">
          <div className="xl-form-row">
            <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") start(); }} placeholder="Name your study…" aria-label="Title of a new study" />
            <button className="btn btn-primary" onClick={start}>Start a study</button>
          </div>
          <div className="xl-chips" role="radiogroup" aria-label="Starting point">
            {STUDY_TEMPLATES.map((t) => <button key={t.id} role="radio" aria-checked={templateId === t.id} className={`xl-chip${templateId === t.id ? " on" : ""}`} onClick={() => setTemplateId(t.id)}>{t.name}</button>)}
          </div>
          <p className="home-dim xl-hint">{template.hint}</p>
          {error && <p className="an-err" role="alert">{error}</p>}
        </div>
      ) : <p className="home-dim"><Link to="/login">Log in</Link> to start a study.</p>}

    </div>
  );
}
