import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useToastStore } from "../lib/toastStore";

interface ContributeBranch {
  slug: string;
  name: string;
}
interface SubmissionAlbum {
  id: number;
  slug: string;
  title: string;
  submissionChannel?: { slug: string } | null;
}
interface SubmissionTrack {
  id: number;
  title: string;
  composer: string | null;
}

export function SubmitWorkPage() {
  useDocumentTitle("Submit work");
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const branchSlug = searchParams.get("branch");
  const albumSlug = searchParams.get("album"); // a submission that was started earlier and is being continued
  const [resume, setResume] = useState<{ state: "idle" | "loading" | "error"; message?: string }>({ state: albumSlug ? "loading" : "idle" });
  const [branch, setBranch] = useState<ContributeBranch | null>(null);

  const [title, setTitle] = useState("");
  const [composer, setComposer] = useState("");
  const [album, setAlbum] = useState<SubmissionAlbum | null>(null);
  const [tracks, setTracks] = useState<SubmissionTrack[]>([]);

  const [trackTitle, setTrackTitle] = useState("");
  const [trackComposer, setTrackComposer] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [channelSlug, setChannelSlug] = useState<string | null>(null);

  useEffect(() => {
    if (branchSlug) api<ContributeBranch>(`/api/contribute/branches/${branchSlug}`).then(setBranch);
  }, [branchSlug]);

  // Continue a submission that was started earlier: only your own, and only while it is still waiting (a reviewed one can't be changed).
  useEffect(() => {
    if (!albumSlug || !user) return;
    let alive = true;
    api<{ id: number; slug: string; title: string; owner: { username: string }; submissionStatus: string | null; submissionChannel: { slug: string } | null; tracks: SubmissionTrack[] }>(`/api/community-albums/${albumSlug}`)
      .then((d) => {
        if (!alive) return;
        if (d.owner.username !== user.username) return setResume({ state: "error", message: "That submission belongs to someone else." });
        if (d.submissionStatus !== "PENDING") return setResume({ state: "error", message: "That submission has already been reviewed, so it can't be changed. You're welcome to start a new one." });
        setAlbum({ id: d.id, slug: d.slug, title: d.title, submissionChannel: d.submissionChannel });
        setChannelSlug(d.submissionChannel?.slug ?? null);
        setTracks(d.tracks.map((t) => ({ id: t.id, title: t.title, composer: t.composer })));
        setResume({ state: "idle" });
      })
      .catch(() => alive && setResume({ state: "error", message: "That submission couldn't be loaded." }));
    return () => { alive = false; };
  }, [albumSlug, user?.username]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createSubmission(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !composer.trim() || !branchSlug) return;
    const created = await api<SubmissionAlbum>("/api/community-albums", {
      method: "POST",
      body: JSON.stringify({ title: title.trim(), composer: composer.trim(), targetBranchSlug: branchSlug }),
    });
    setAlbum(created);
    const detail = await api<{ submissionChannel: { slug: string } | null }>(`/api/community-albums/${created.slug}`);
    setChannelSlug(detail.submissionChannel?.slug ?? null);
  }

  async function uploadTrack() {
    const file = fileInputRef.current?.files?.[0];
    if (!album || !file || !trackTitle.trim()) return;
    setUploadError(null);
    const formData = new FormData();
    formData.append("title", trackTitle.trim());
    formData.append("permission", "LISTEN_ONLY");
    if (trackComposer.trim()) formData.append("composer", trackComposer.trim());
    formData.append("file", file);
    try {
      const track = await api<SubmissionTrack>(`/api/community-albums/${album.id}/tracks`, { method: "POST", body: formData });
      setTracks((t) => [...t, track]);
      setTrackTitle("");
      setTrackComposer("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  function finish() {
    useToastStore.getState().showToast("Sent for review ✓");
    if (album) navigate(`/community-album/${album.slug}`);
  }

  if (!user) {
    return (
      <p>
        You need to <Link to="/login">log in</Link> to submit work.
      </p>
    );
  }

  if (!branchSlug) {
    return (
      <p>
        Choose a branch to submit to on the <Link to="/contribute">Contribute</Link> page first.
      </p>
    );
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h1>Submit work{branch ? ` to ${branch.name}` : ""}</h1>
      <ol className="ct-mini" aria-label="Steps" data-testid="submit-steps">
        <li aria-current={!album ? "step" : undefined}>1 · Name it</li>
        <li aria-current={album && tracks.length === 0 ? "step" : undefined}>2 · Add your tracks</li>
        <li aria-current={album && tracks.length > 0 ? "step" : undefined}>3 · Send for review</li>
      </ol>
      <p className="home-dim" style={{ fontSize: "0.85rem" }}>The team listens and decides. Your work only joins the branch if it is approved, and you'll hear back in a discussion that opens for it.</p>

      {resume.state === "loading" && <p className="home-dim" role="status">Loading your submission…</p>}
      {resume.state === "error" && <p role="alert" data-testid="resume-error" style={{ color: "var(--accent-danger)" }}>{resume.message}</p>}
      {resume.state === "loading" ? null : !album ? (
        <form onSubmit={createSubmission} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label htmlFor="sub-title">Album or EP title</label>
          <input id="sub-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Album/EP title" required />
          <label htmlFor="sub-artist">Your artist name</label>
          <input id="sub-artist" value={composer} onChange={(e) => setComposer(e.target.value)} placeholder="Your artist name" required />
          <button className="btn btn-primary" type="submit">
            Start submission
          </button>
        </form>
      ) : (
        <>
          <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
            "{album.title}" is started and waiting for review. Add your tracks below, then finish.
            {channelSlug && (
              <>
                {" "}
                A <Link to={`/topic/${channelSlug}`}>discussion with the team</Link> has been started for feedback.
              </>
            )}
          </p>

          {tracks.length > 0 && (
            <ul style={{ fontSize: "0.85rem" }}>
              {tracks.map((t) => (
                <li key={t.id}>
                  {t.title}
                  {t.composer ? ` - ${t.composer}` : ""}
                </li>
              ))}
            </ul>
          )}

          <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.6rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <label htmlFor="sub-track-title">Track title</label>
            <input id="sub-track-title" value={trackTitle} onChange={(e) => setTrackTitle(e.target.value)} placeholder="Track title" />
            <label htmlFor="sub-track-artist">Track artist (if different from the album artist)</label>
            <input id="sub-track-artist" value={trackComposer} onChange={(e) => setTrackComposer(e.target.value)} placeholder="Track artist (if different from album artist)" />
            <label htmlFor="sub-track-file">Audio file</label>
            <input id="sub-track-file" ref={fileInputRef} type="file" accept="audio/*" />
            {uploadError && <p style={{ color: "var(--accent-danger, #e2703f)", fontSize: "0.8rem" }}>{uploadError}</p>}
            <button className="btn" onClick={uploadTrack}>
              Add track
            </button>
          </div>

          <button className="btn btn-primary" style={{ marginTop: "1rem" }} disabled={tracks.length === 0} onClick={finish}>
            Finish and send for review
          </button>
          {tracks.length === 0 && <p className="home-dim" style={{ fontSize: "0.8rem" }}>Add at least one track so the team has something to listen to.</p>}
        </>
      )}
    </div>
  );
}
