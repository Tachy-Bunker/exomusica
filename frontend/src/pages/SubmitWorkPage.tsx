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
    useToastStore.getState().showToast("Submitted ✓");
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
        Pick a branch to submit to from <Link to="/contribute">Choose your next project</Link> first.
      </p>
    );
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h1>Submit work{branch ? ` to ${branch.name}` : ""}</h1>

      {!album ? (
        <form onSubmit={createSubmission} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Album/EP title" required />
          <input value={composer} onChange={(e) => setComposer(e.target.value)} placeholder="Your artist name" required />
          <button className="btn btn-primary" type="submit">
            Start submission
          </button>
        </form>
      ) : (
        <>
          <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
            "{album.title}" created. Add tracks below, then finish when ready.
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
            <input value={trackTitle} onChange={(e) => setTrackTitle(e.target.value)} placeholder="Track title" />
            <input value={trackComposer} onChange={(e) => setTrackComposer(e.target.value)} placeholder="Track artist (if different from album artist)" />
            <input ref={fileInputRef} type="file" accept="audio/*" />
            {uploadError && <p style={{ color: "var(--accent-danger, #e2703f)", fontSize: "0.8rem" }}>{uploadError}</p>}
            <button className="btn" onClick={uploadTrack}>
              Add track
            </button>
          </div>

          <button className="btn btn-primary" style={{ marginTop: "1rem" }} disabled={tracks.length === 0} onClick={finish}>
            Finish submission
          </button>
        </>
      )}
    </div>
  );
}
