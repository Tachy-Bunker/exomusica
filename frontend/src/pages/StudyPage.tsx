import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { renderMarkdown } from "../lib/markdown";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useToastStore } from "../lib/toastStore";
import { StudyChartView } from "../components/StudyChartView";

interface Annotation {
  id: number;
  position: number;
  text: string;
}

interface Chart {
  id: number;
  position: number;
  title: string;
  kind: "LINE" | "BAR" | "SCATTER" | "TABLE";
  xLabel: string | null;
  yLabel: string | null;
  dataCsv: string;
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
  charts: Chart[];
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
  const [addingChart, setAddingChart] = useState(false);
  const [chartForm, setChartForm] = useState({ title: "", kind: "LINE" as Chart["kind"], xLabel: "", yLabel: "", dataCsv: "" });
  const [editingChartId, setEditingChartId] = useState<number | null>(null);

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

  function startAddChart() {
    setChartForm({ title: "", kind: "LINE", xLabel: "", yLabel: "", dataCsv: "x,y\n1,2\n2,4\n3,3" });
    setEditingChartId(null);
    setAddingChart(true);
  }

  function startEditChart(c: Chart) {
    setChartForm({ title: c.title, kind: c.kind, xLabel: c.xLabel ?? "", yLabel: c.yLabel ?? "", dataCsv: c.dataCsv });
    setEditingChartId(c.id);
    setAddingChart(true);
  }

  async function saveChart() {
    if (!study || !chartForm.title.trim() || !chartForm.dataCsv.trim()) return;
    const body = JSON.stringify({
      title: chartForm.title.trim(),
      kind: chartForm.kind,
      xLabel: chartForm.xLabel.trim() || null,
      yLabel: chartForm.yLabel.trim() || null,
      dataCsv: chartForm.dataCsv,
    });
    if (editingChartId) {
      await api(`/api/study-charts/${editingChartId}`, { method: "PATCH", body });
    } else {
      await api(`/api/studies/${study.slug}/charts`, { method: "POST", body });
    }
    setAddingChart(false);
    useToastStore.getState().showToast("Saved ✓");
    reload();
  }

  async function deleteChart(id: number) {
    if (!confirm("Delete this chart?")) return;
    await api(`/api/study-charts/${id}`, { method: "DELETE" });
    reload();
  }

  async function moveChart(index: number, direction: -1 | 1) {
    if (!study) return;
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= study.charts.length) return;
    const reordered = [...study.charts];
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
    await api(`/api/studies/${study.slug}/charts/reorder`, { method: "POST", body: JSON.stringify({ chartIds: reordered.map((c) => c.id) }) });
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

      {(study.charts.length > 0 || isOwner) && (
        <div style={{ marginTop: "2rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: "0.95rem" }}>Charts &amp; data</h2>
            {isOwner && !addingChart && (
              <button className="btn" style={{ fontSize: "0.75rem" }} onClick={startAddChart}>
                + add chart/table
              </button>
            )}
          </div>

          {study.charts.map((c, i) => (
            <div key={c.id} style={{ margin: "1rem 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <h3 style={{ fontSize: "0.85rem", margin: 0 }}>{c.title}</h3>
                {isOwner && (
                  <span style={{ fontSize: "0.72rem" }}>
                    <button className="btn" style={{ padding: "0 0.3rem" }} onClick={() => moveChart(i, -1)}>
                      ↑
                    </button>
                    <button className="btn" style={{ padding: "0 0.3rem" }} onClick={() => moveChart(i, 1)}>
                      ↓
                    </button>
                    <button className="btn" style={{ padding: "0 0.3rem" }} onClick={() => startEditChart(c)}>
                      edit
                    </button>
                    <button className="btn btn-danger" style={{ padding: "0 0.3rem" }} onClick={() => deleteChart(c.id)}>
                      remove
                    </button>
                  </span>
                )}
              </div>
              <StudyChartView kind={c.kind} xLabel={c.xLabel} yLabel={c.yLabel} dataCsv={c.dataCsv} />
            </div>
          ))}

          {addingChart && (
            <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.6rem", marginTop: "0.5rem" }}>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
                <input
                  value={chartForm.title}
                  onChange={(e) => setChartForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Chart title"
                  style={{ fontSize: "0.85rem" }}
                />
                <select value={chartForm.kind} onChange={(e) => setChartForm((f) => ({ ...f, kind: e.target.value as Chart["kind"] }))}>
                  <option value="LINE">Line</option>
                  <option value="BAR">Bar</option>
                  <option value="SCATTER">Scatter</option>
                  <option value="TABLE">Table only</option>
                </select>
                {chartForm.kind !== "TABLE" && (
                  <>
                    <input
                      value={chartForm.xLabel}
                      onChange={(e) => setChartForm((f) => ({ ...f, xLabel: e.target.value }))}
                      placeholder="X axis label (optional)"
                      style={{ fontSize: "0.85rem" }}
                    />
                    <input
                      value={chartForm.yLabel}
                      onChange={(e) => setChartForm((f) => ({ ...f, yLabel: e.target.value }))}
                      placeholder="Y axis label (optional)"
                      style={{ fontSize: "0.85rem" }}
                    />
                  </>
                )}
              </div>
              <p style={{ fontSize: "0.72rem", color: "var(--text-dim)", margin: "0 0 0.2rem" }}>
                CSV - first row is headers. First column is X (or the row label for a table); every other column is its own data series.
              </p>
              <textarea
                value={chartForm.dataCsv}
                onChange={(e) => setChartForm((f) => ({ ...f, dataCsv: e.target.value }))}
                rows={6}
                style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}
              />
              <div style={{ marginTop: "0.4rem" }}>
                <button className="btn btn-primary" style={{ fontSize: "0.8rem" }} onClick={saveChart}>
                  Save chart
                </button>{" "}
                <button className="btn" style={{ fontSize: "0.8rem" }} onClick={() => setAddingChart(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
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
