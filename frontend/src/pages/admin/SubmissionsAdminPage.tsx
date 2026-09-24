import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { useToastStore } from "../../lib/toastStore";

interface Submission {
  id: number;
  slug: string;
  title: string;
  composer: string;
  submissionStatus: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  owner: { username: string };
  targetBranch: { slug: string; name: string } | null;
  submissionChannel: { slug: string } | null;
  tracks: { id: number }[];
}

export function SubmissionsAdminPage() {
  useDocumentTitle("Submissions");
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  function load() {
    api<Submission[]>("/api/admin/submissions").then(setSubmissions);
  }
  useEffect(load, []);

  async function setStatus(id: number, status: "APPROVED" | "REJECTED" | "PENDING") {
    await api(`/api/admin/submissions/${id}`, { method: "PATCH", body: JSON.stringify({ submissionStatus: status }) });
    load();
  }

  async function moveToBranch(s: Submission) {
    if (!s.targetBranch) return;
    if (!confirm(`Move "${s.title}" into the official ${s.targetBranch.name} branch? This creates a new official album from it.`)) return;
    const branches = await api<{ id: number; slug: string }[]>("/api/admin/branches");
    const branch = branches.find((b) => b.slug === s.targetBranch!.slug);
    if (!branch) return;
    await api(`/api/admin/community-albums/${s.id}/duplicate-to-branch`, { method: "POST", body: JSON.stringify({ branchId: branch.id }) });
    useToastStore.getState().showToast("Moved to branch ✓");
    setStatus(s.id, "APPROVED");
  }

  return (
    <div>
      <h1>Submissions</h1>
      <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
        Branch contribution submissions. Discuss with the submitter in the linked channel, then move approved work
        into the official branch.
      </p>
      <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse", marginTop: "0.8rem" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Title</th>
            <th style={{ textAlign: "left" }}>Artist</th>
            <th style={{ textAlign: "left" }}>Branch</th>
            <th style={{ textAlign: "left" }}>Tracks</th>
            <th style={{ textAlign: "left" }}>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {submissions.map((s) => (
            <tr key={s.id} style={{ borderTop: "1px solid var(--border)" }}>
              <td>
                <Link to={`/community-album/${s.slug}`}>{s.title}</Link>
              </td>
              <td>{s.composer} ({s.owner.username})</td>
              <td>{s.targetBranch?.name ?? "-"}</td>
              <td>{s.tracks.length}</td>
              <td>{s.submissionStatus}</td>
              <td>
                <span style={{ display: "flex", gap: "0.3rem" }}>
                  {s.submissionChannel && (
                    <Link className="btn" style={{ fontSize: "0.72rem" }} to={`/topic/${s.submissionChannel.slug}`}>
                      discuss
                    </Link>
                  )}
                  <button className="btn" style={{ fontSize: "0.72rem" }} onClick={() => moveToBranch(s)}>
                    move to branch
                  </button>
                  <button className="btn btn-danger" style={{ fontSize: "0.72rem" }} onClick={() => setStatus(s.id, "REJECTED")}>
                    reject
                  </button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
