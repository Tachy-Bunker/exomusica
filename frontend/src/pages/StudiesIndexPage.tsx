import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";

interface StudySummary {
  slug: string;
  title: string;
  status: "IN_PROGRESS" | "COMPLETE";
  owner: string;
  updatedAt: string;
}

export function StudiesIndexPage() {
  useDocumentTitle("Studies");
  const [studies, setStudies] = useState<StudySummary[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api<StudySummary[]>("/api/studies").then(setStudies);
  }, []);

  async function startStudy() {
    if (!newTitle.trim()) return;
    const created = await api<{ slug: string }>("/api/studies", { method: "POST", body: JSON.stringify({ title: newTitle.trim() }) });
    navigate(`/study/${created.slug}`);
  }

  const inProgress = studies.filter((s) => s.status === "IN_PROGRESS");
  const complete = studies.filter((s) => s.status === "COMPLETE");

  return (
    <div style={{ maxWidth: 720 }}>
      <h1>Studies</h1>
      <p style={{ color: "var(--text-dim)" }}>
        Documented phenomena and experiments for the Exomusica ecosystem to use - each study gets its own
        discussion, right alongside the writing.
      </p>

      {user && (
        <div style={{ display: "flex", gap: "0.4rem", margin: "1rem 0" }}>
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Start a new study..." style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={startStudy}>
            Start
          </button>
        </div>
      )}

      <h2 style={{ fontSize: "1.05rem", marginTop: "1.5rem" }}>In progress</h2>
      {inProgress.length === 0 && <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Nothing in progress yet.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {inProgress.map((s) => (
          <Link key={s.slug} to={`/study/${s.slug}`} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.5rem 0.7rem", textDecoration: "none", color: "inherit" }}>
            <div>{s.title}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>by {s.owner}</div>
          </Link>
        ))}
      </div>

      <h2 style={{ fontSize: "1.05rem", marginTop: "1.5rem" }}>Complete</h2>
      {complete.length === 0 && <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>None finished yet.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {complete.map((s) => (
          <Link key={s.slug} to={`/study/${s.slug}`} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.5rem 0.7rem", textDecoration: "none", color: "inherit" }}>
            <div>{s.title}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>by {s.owner}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
