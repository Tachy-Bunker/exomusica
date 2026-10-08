import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Username } from "../components/Username";

interface ChallengeSummary { id: number; title: string; prompt: string; active: boolean; submissionCount: number }
interface Submission { id: number; username: string; trackTitle: string; albumTitle: string; albumSlug: string; coverArtUrl: string | null }
interface ChallengeDetail { id: number; title: string; prompt: string; active: boolean; submissions: Submission[] }

/** A recurring constraint and a thread of what people made of it. Lives in XenoLab's Challenges tab. The newest open one starts open. */
export function ChallengesPanel() {
  const { user } = useAuth();
  const [challenges, setChallenges] = useState<ChallengeSummary[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ChallengeDetail | null>(null);
  const [myTracks, setMyTracks] = useState<{ id: number; title: string; albumTitle: string }[]>([]);
  const [chosenTrack, setChosenTrack] = useState<number | "">("");
  const [newTitle, setNewTitle] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);

  function loadChallenges(autoOpen = false) {
    api<ChallengeSummary[]>("/api/challenges").then((list) => {
      setChallenges(list);
      if (autoOpen) { const first = list.find((c) => c.active) ?? list[0]; if (first) openChallenge(first.id); }
    }).catch(() => setChallenges([]));
  }
  useEffect(() => loadChallenges(true), []);

  async function openChallenge(id: number) {
    setOpenId(id);
    setDetail(await api<ChallengeDetail>(`/api/challenges/${id}`));
  }

  useEffect(() => {
    if (!user) return;
    api<{ slug: string }[]>("/api/community-albums?mine=true").then((albums) => {
      Promise.all(albums.map((a) => api<{ tracks: { id: number; title: string }[] }>(`/api/community-albums/${a.slug}`).then((d) => d.tracks.map((t) => ({ id: t.id, title: t.title, albumTitle: a.slug }))))).then((lists) => setMyTracks(lists.flat()));
    }).catch(() => {});
  }, [user]);

  async function submit() {
    if (!openId || !chosenTrack) return;
    setError(null);
    try {
      await api(`/api/challenges/${openId}/submit`, { method: "POST", body: JSON.stringify({ trackId: chosenTrack }) });
      setChosenTrack("");
      openChallenge(openId);
      loadChallenges();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    }
  }
  async function withdraw(submissionId: number) {
    await api(`/api/challenge-submissions/${submissionId}`, { method: "DELETE" });
    if (openId) openChallenge(openId);
    loadChallenges();
  }
  async function createChallenge(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !newPrompt.trim()) return;
    await api("/api/admin/challenges", { method: "POST", body: JSON.stringify({ title: newTitle.trim(), prompt: newPrompt.trim() }) });
    setNewTitle(""); setNewPrompt("");
    loadChallenges();
  }
  async function toggleActive(id: number, active: boolean) {
    await api(`/api/admin/challenges/${id}`, { method: "PATCH", body: JSON.stringify({ active }) });
    loadChallenges();
  }

  return (
    <div data-testid="challenges-panel">
      <p className="home-dim xl-bar-text">A constraint to make something from. Take one on, then submit a track you made for it.</p>

      {user?.isAdmin && (
        <form onSubmit={createChallenge} className="xl-form">
          <b>New challenge (admin)</b>
          <input placeholder="Title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} aria-label="Challenge title" />
          <textarea placeholder="The prompt / constraint" value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)} rows={2} aria-label="Challenge prompt" />
          <button className="btn btn-primary" type="submit" style={{ alignSelf: "flex-start" }}>Create</button>
        </form>
      )}

      {challenges === null ? <p className="home-dim">Loading…</p> : challenges.length === 0 ? <p className="home-dim">No challenges yet.</p> : (
        <ul className="xl-cards">
          {challenges.map((c) => (
            <li key={c.id} className={`xl-card${c.active ? "" : " xl-card-closed"}`}>
              <div className="xl-card-top">
                <b>{c.title}</b>
                <span className="home-dim">{c.active ? "open" : "closed"} · {c.submissionCount} submission{c.submissionCount !== 1 ? "s" : ""}</span>
              </div>
              {openId !== c.id && <p className="xl-card-text xl-clamp">{c.prompt}</p>}
              <div className="xl-card-actions">
                <button className="btn" aria-expanded={openId === c.id} onClick={() => (openId === c.id ? (setOpenId(null), setDetail(null)) : openChallenge(c.id))}>{openId === c.id ? "Hide" : c.active ? "Take it on" : "View"}</button>
                {user?.isAdmin && <button className="btn" onClick={() => toggleActive(c.id, !c.active)}>{c.active ? "Close" : "Reopen"}</button>}
              </div>

              {openId === c.id && detail && (
                <div className="xl-card-open">
                  <p className="xl-card-text">{detail.prompt}</p>
                  {detail.submissions.length === 0 ? <p className="home-dim">No submissions yet. Be the first.</p> : (
                    <ul className="xl2-list">
                      {detail.submissions.map((s) => (
                        <li key={s.id} className="xl-sub">
                          <span><Link to={`/community-album/${s.albumSlug}`}>{s.trackTitle}</Link> <span className="home-dim"><Username name={s.username} /></span></span>
                          {user?.username === s.username && <button className="btn btn-danger" onClick={() => withdraw(s.id)}>withdraw</button>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {!user && detail.active && <p className="home-dim"><Link to="/login">Log in</Link> to submit a track.</p>}
                  {user && detail.active && (
                    <div className="xl-form-row">
                      <select value={chosenTrack} onChange={(e) => setChosenTrack(e.target.value ? Number(e.target.value) : "")} aria-label="Your track to submit" style={{ flex: 1 }}>
                        <option value="">{myTracks.length ? "- pick one of your tracks -" : "- you have no tracks yet -"}</option>
                        {myTracks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                      </select>
                      <button className="btn btn-primary" onClick={submit} disabled={!chosenTrack}>Submit</button>
                    </div>
                  )}
                  {user && detail.active && myTracks.length === 0 && <p className="home-dim">Upload a track first in <Link to="/cult">Cult activities</Link>.</p>}
                  {error && <p className="an-err" role="alert">{error}</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
