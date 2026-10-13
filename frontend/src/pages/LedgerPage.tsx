import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Username } from "../components/Username";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { Loading } from "../components/Loading";

interface Ledger { shares: { username: string; earned: number; sharePermille: number }[]; entries: { username: string; points: number; reason: string; at: number; album: { slug: string; title: string } | null }[] }

/** The public points ledger: who earned how much, and for what. Spending on rewards stays private. */
export function LedgerPage() {
  useDocumentTitle("Points ledger");
  const [d, setD] = useState<Ledger | null>(null);
  useEffect(() => { api<Ledger>("/api/ledger").then(setD).catch(() => setD({ shares: [], entries: [] })); }, []);
  return (
    <div className="page-column" data-testid="ledger-page">
      <h1>Points ledger</h1>
      <p className="home-dim">Every contributor point, who earned it and why. Only earnings are listed. <Link to="/rewards">Rewards</Link></p>
      {!d ? <Loading /> : d.entries.length === 0 ? <p className="home-dim">No points have been awarded yet.</p> : (
        <>
          <h2 className="home-h2">Shares</h2>
          <table className="ledger-table" data-testid="ledger-shares">
            <thead><tr><th>Member</th><th>Earned</th><th>Share</th></tr></thead>
            <tbody>{d.shares.map((s) => <tr key={s.username}><td>{s.username === "former member" ? s.username : <Username name={s.username} />}</td><td>{s.earned}</td><td>{(s.sharePermille / 10).toFixed(1)}%</td></tr>)}</tbody>
          </table>
          <h2 className="home-h2">How points were earned</h2>
          <ul className="ledger-list" data-testid="ledger-entries">
            {d.entries.map((e, i) => (
              <li key={i}><b>+{e.points}</b> {e.username === "former member" ? e.username : <Username name={e.username} />} <span className="home-dim">· {new Date(e.at).toLocaleDateString()}</span><br />{e.reason}{e.album && <> · <Link to={`/community-album/${e.album.slug}`}>{e.album.title}</Link></>}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
