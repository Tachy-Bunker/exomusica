import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";

interface ChallengeSummary {
  id: number;
  title: string;
  prompt: string;
  active: boolean;
  submissionCount: number;
}
interface Submission {
  id: number;
  username: string;
  trackTitle: string;
  albumTitle: string;
  albumSlug: string;
  coverArtUrl: string | null;
}
interface ChallengeDetail {
  id: number;
  title: string;
  prompt: string;
  active: boolean;
  submissions: Submission[];
}

export function ChallengesPage() {
  useDocumentTitle("Challenges");
  const { user } = useAuth();
  const [challenges, setChallenges] = useState<ChallengeSummary[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ChallengeDetail | null>(null);
  const [myTracks, setMyTracks] = useState<{ id: number; title: string; albumTitle: string }[]>([]);
  const [chosenTrack, setChosenTrack] = useState<number | "">("");

  const [newTitle, setNewTitle] = useState("");
  const [newPrompt, setNewPrompt] = useState("");

  function loadChallenges() {
    api<ChallengeSummary[]>("/api/challenges").then(setChallenges);
  }
  useEffect(loadChallenges, []);

  async function openChallenge(id: number) {
    setOpenId(id);
    const d = await api<ChallengeDetail>(`/api/challenges/${id}`);
    setDetail(d);
  }

  useEffect(() => {
    if (!user) return;
    api<{ slug: string }[]>("/api/community-albums?mine=true").then((albums) => {
      Promise.all(
        albums.map((a) =>
          api<{ tracks: { id: number; title: string }[] }>(`/api/community-albums/${a.slug}`).then((d) =>
            d.tracks.map((t) => ({ id: t.id, title: t.title, albumTitle: a.slug })),
          ),
        ),
      ).then((lists) => setMyTracks(lists.flat()));
    });
  }, [user]);

  async function submit() {
    if (!openId || !chosenTrack) return;
    try {
      await api(`/api/challenges/${openId}/submit`, { method: "POST", body: JSON.stringify({ trackId: chosenTrack }) });
      setChosenTrack("");
      openChallenge(openId);
      loadChallenges();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to submit");
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
    setNewTitle("");
    setNewPrompt("");
    loadChallenges();
  }

  async function toggleActive(id: number, active: boolean) {
    await api(`/api/admin/challenges/${id}`, { method: "PATCH", body: JSON.stringify({ active }) });
    loadChallenges();
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h1>Challenges</h1>
      <p style={{ color: "var(--text-dim)" }}>A recurring constraint, a submission thread — see what people make of it.</p>

      {user?.isAdmin && (
        <form onSubmit={createChallenge} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.6rem", marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <h3 style={{ fontSize: "0.9rem", margin: 0 }}>New challenge (admin)</h3>
          <input placeholder="Title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <textarea placeholder="The prompt / constraint" value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)} rows={2} />
          <button className="btn btn-primary" type="submit" style={{ alignSelf: "flex-start" }}>
            Create
          </button>
        </form>
      )}

      {challenges.map((c) => (
        <div key={c.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.6rem", marginBottom: "0.6rem", opacity: c.active ? 1 : 0.6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: "var(--font-display)" }}>
                {c.title} {!c.active && <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>(closed)</span>}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>{c.submissionCount} submission{c.submissionCount !== 1 ? "s" : ""}</div>
            </div>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <button className="btn" onClick={() => openChallenge(c.id)}>
                {openId === c.id ? "Hide" : "View"}
              </button>
              {user?.isAdmin && (
                <button className="btn" onClick={() => toggleActive(c.id, !c.active)}>
                  {c.active ? "Close" : "Reopen"}
                </button>
              )}
            </div>
          </div>

          {openId === c.id && detail && (
            <div style={{ marginTop: "0.6rem", paddingTop: "0.6rem", borderTop: "1px solid var(--border)" }}>
              <p>{detail.prompt}</p>

              {detail.submissions.length === 0 ? (
                <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>No submissions yet.</p>
              ) : (
                detail.submissions.map((s) => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", marginBottom: "0.3rem" }}>
                    <span>
                      <Link to={`/community-album/${s.albumSlug}`}>{s.trackTitle}</Link>
                      <span style={{ color: "var(--text-dim)" }}> — {s.username}</span>
                    </span>
                    {user?.username === s.username && (
                      <button className="btn btn-danger" style={{ fontSize: "0.7rem" }} onClick={() => withdraw(s.id)}>
                        withdraw
                      </button>
                    )}
                  </div>
                ))
              )}

              {user && detail.active && (
                <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.6rem" }}>
                  <select value={chosenTrack} onChange={(e) => setChosenTrack(e.target.value ? Number(e.target.value) : "")} style={{ flex: 1 }}>
                    <option value="">— pick one of your tracks —</option>
                    {myTracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-primary" onClick={submit}>
                    Submit
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
