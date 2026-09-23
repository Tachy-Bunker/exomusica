import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { renderMarkdown } from "../lib/markdown";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useToastStore } from "../lib/toastStore";

interface Annotation {
  id: number;
  position: number;
  text: string;
}

interface StudyDetail {
  id: number;
  slug: string;
  title: string;
  body: string;
  status: "IN_PROGRESS" | "COMPLETE";
  owner: { id: number; username: string };
  channel: { slug: string } | null;
  annotations: Annotation[];
}

export function StudyPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [study, setStudy] = useState<StudyDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [newAnnotation, setNewAnnotation] = useState("");
  const [editingAnnotationId, setEditingAnnotationId] = useState<number | null>(null);
  const [annotationDraft, setAnnotationDraft] = useState("");

  useDocumentTitle(study?.title ?? "Study");

  function reload() {
    if (!slug) return;
    api<StudyDetail>(`/api/studies/${slug}`).then(setStudy);
  }
  useEffect(reload, [slug]);

  const isOwner = !!(user && study && (user.id === study.owner.id || user.isAdmin));

  function startEdit() {
    if (!study) return;
    setDraftTitle(study.title);
    setDraftBody(study.body);
    setEditing(true);
  }

  async function saveEdit() {
    if (!study) return;
    await api(`/api/studies/${study.slug}`, { method: "PATCH", body: JSON.stringify({ title: draftTitle.trim(), body: draftBody }) });
    setEditing(false);
    useToastStore.getState().showToast("Saved ✓");
    reload();
  }

  async function toggleStatus() {
    if (!study) return;
    await api(`/api/studies/${study.slug}`, { method: "PATCH", body: JSON.stringify({ status: study.status === "IN_PROGRESS" ? "COMPLETE" : "IN_PROGRESS" }) });
    reload();
  }

  async function deleteStudy() {
    if (!study || !confirm("Delete this study permanently?")) return;
    await api(`/api/studies/${study.slug}`, { method: "DELETE" });
    navigate("/studies");
  }

  async function addAnnotation() {
    if (!study || !newAnnotation.trim()) return;
    await api(`/api/studies/${study.slug}/annotations`, { method: "POST", body: JSON.stringify({ text: newAnnotation.trim() }) });
    setNewAnnotation("");
    reload();
  }

  async function saveAnnotationEdit(id: number) {
    if (!annotationDraft.trim()) return;
    await api(`/api/study-annotations/${id}`, { method: "PATCH", body: JSON.stringify({ text: annotationDraft.trim() }) });
    setEditingAnnotationId(null);
    reload();
  }

  async function deleteAnnotation(id: number) {
    await api(`/api/study-annotations/${id}`, { method: "DELETE" });
    reload();
  }

  async function moveAnnotation(index: number, direction: -1 | 1) {
    if (!study) return;
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= study.annotations.length) return;
    const reordered = [...study.annotations];
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
    await api(`/api/studies/${study.slug}/annotations/reorder`, { method: "POST", body: JSON.stringify({ annotationIds: reordered.map((a) => a.id) }) });
    reload();
  }

  if (!study) return <p>Loading...</p>;

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
        {editing ? (
          <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} style={{ fontSize: "1.4rem", flex: 1 }} />
        ) : (
          <h1 style={{ margin: 0 }}>{study.title}</h1>
        )}
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexShrink: 0 }}>
          <span
            style={{
              fontSize: "0.7rem",
              padding: "0.15rem 0.5rem",
              borderRadius: "999px",
              border: "1px solid var(--border)",
              color: study.status === "COMPLETE" ? "var(--accent-audio)" : "var(--text-dim)",
            }}
          >
            {study.status === "COMPLETE" ? "Complete" : "In progress"}
          </span>
        </div>
      </div>
      <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
        by {study.owner.username}
        {study.channel && (
          <>
            {" · "}
            <Link to={`/topic/${study.channel.slug}`}>discuss this study</Link>
          </>
        )}
      </p>

      {isOwner && (
        <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1rem" }}>
          {editing ? (
            <>
              <button className="btn btn-primary" onClick={saveEdit}>
                Save
              </button>
              <button className="btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="btn" onClick={startEdit}>
              Edit
            </button>
          )}
          <button className="btn" onClick={toggleStatus}>
            Mark as {study.status === "IN_PROGRESS" ? "complete" : "in progress"}
          </button>
          <button className="btn btn-danger" onClick={deleteStudy}>
            Delete
          </button>
        </div>
      )}

      {editing ? (
        <textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} rows={16} style={{ width: "100%", fontFamily: "var(--font-mono)" }} />
      ) : (
        <div>{renderMarkdown(study.body, (path) => navigate(path))}</div>
      )}

      {(study.annotations.length > 0 || isOwner) && (
        <div style={{ marginTop: "2rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
          <h2 style={{ fontSize: "0.95rem" }}>Notes</h2>
          <ol style={{ paddingLeft: "1.4rem", fontSize: "0.85rem" }}>
            {study.annotations.map((a, i) => (
              <li key={a.id} style={{ marginBottom: "0.4rem" }}>
                {editingAnnotationId === a.id ? (
                  <div style={{ display: "flex", gap: "0.3rem" }}>
                    <input value={annotationDraft} onChange={(e) => setAnnotationDraft(e.target.value)} style={{ flex: 1, fontSize: "0.85rem" }} />
                    <button className="btn btn-primary" style={{ fontSize: "0.75rem" }} onClick={() => saveAnnotationEdit(a.id)}>
                      save
                    </button>
                  </div>
                ) : (
                  <span>
                    {a.text}
                    {isOwner && (
                      <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }}>
                        <button className="btn" style={{ padding: "0 0.3rem" }} onClick={() => moveAnnotation(i, -1)}>
                          ↑
                        </button>
                        <button className="btn" style={{ padding: "0 0.3rem" }} onClick={() => moveAnnotation(i, 1)}>
                          ↓
                        </button>
                        <button
                          className="btn"
                          style={{ padding: "0 0.3rem" }}
                          onClick={() => {
                            setEditingAnnotationId(a.id);
                            setAnnotationDraft(a.text);
                          }}
                        >
                          edit
                        </button>
                        <button className="btn btn-danger" style={{ padding: "0 0.3rem" }} onClick={() => deleteAnnotation(a.id)}>
                          remove
                        </button>
                      </span>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ol>
          {isOwner && (
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <input
                value={newAnnotation}
                onChange={(e) => setNewAnnotation(e.target.value)}
                placeholder={`Add note [${study.annotations.length + 1}]...`}
                style={{ flex: 1, fontSize: "0.85rem" }}
              />
              <button className="btn btn-primary" style={{ fontSize: "0.8rem" }} onClick={addAnnotation}>
                Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
