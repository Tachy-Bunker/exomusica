import { Link } from "react-router-dom";

/** The studies connected to a branch: a short list under its pictures (Explore) or albums (Soundbay). Nothing is drawn when there are none. */
export function BranchStudies({ studies }: { studies: { slug: string; title: string; complete: boolean }[] }) {
  if (studies.length === 0) return null;
  return (
    <div className="branch-studies" data-testid="branch-studies">
      <p className="sb-prev-label">Studies</p>
      <ul>
        {studies.map((s) => <li key={s.slug}><Link to={`/study/${s.slug}`}>{s.title}</Link>{s.complete && <span className="home-dim"> · complete</span>}</li>)}
      </ul>
    </div>
  );
}
