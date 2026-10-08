import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadWikiPages, useLoaded } from "../../lib/hubs";
import { buildTree, type WikiNode } from "../../lib/logTree";

function Nodes({ nodes }: { nodes: WikiNode[] }) {
  return (
    <ul className="xl-tree">
      {nodes.map((n) => (
        <li key={n.page.id}>
          <Link to={`/wiki/${n.page.slug}`}>{n.page.title}</Link>
          {n.children.length > 0 && <Nodes nodes={n.children} />}
        </li>
      ))}
    </ul>
  );
}

/** The Log, readable right here: every entry, nested under its parent. */
export function LogPanel() {
  const { data, failed } = useLoaded(loadWikiPages);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return q ? data.filter((p) => p.title.toLowerCase().includes(q)).map((p) => ({ ...p, parentId: null })) : data;
  }, [data, query]);
  const tree = useMemo(() => buildTree(shown), [shown]);
  return (
    <div data-testid="log-panel">
      <div className="xl-bar">
        <p className="home-dim xl-bar-text">The Log: what the community has written down about how this all works.</p>
        <Link className="btn" to="/wiki">Open the Log</Link>
      </div>
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the Log" aria-label="Search the Log" className="xl-search" />
      {failed ? <p className="home-dim">Could not load the Log.</p> : !data ? <p className="home-dim">Loading…</p> : tree.length === 0 ? <p className="home-dim">{query ? "No entry matches." : "The Log is empty."}</p> : <Nodes nodes={tree} />}
    </div>
  );
}
