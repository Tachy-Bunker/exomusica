import { branchHref } from "../lib/branchLinks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { renderInlineMarkdown, renderMarkdown } from "../lib/markdown";
import { findPlacedFigures, noteDeletionMap, noteSwapMap, remapFigureRefs, remapMarkers } from "../lib/footnotes";
import { figureRefRemap, numberCharts } from "../lib/figures";
import { extractHeadings } from "../lib/outline";
import { clearDraft, differsFromSaved, loadDraft, saveDraft, type StudyDraft } from "../lib/studyDraft";
import { StudyEditor } from "../components/StudyEditor";
import { StudyHistory } from "../components/StudyHistory";
import { useFigures } from "../components/StudyFigure";
import { AudioEvidence, type EvidenceClip } from "../components/AudioEvidence";
import { formatClip, parseClip, stripClip, type Clip } from "../lib/clips";
import type { AnalysisChart } from "../lib/analysisCharts";
import { stopClip } from "../lib/clipPlayer";
import { uploadStudyFile, uploadStudyFileInfo, type UploadedStudyFile } from "../lib/uploadAttachment";
import { StudyFile, type StudyFileInfo } from "../components/StudyFile";
import { ChannelPicker } from "../components/ChannelPicker";
import { QrModal } from "../components/QrModal";
import { VoiceNoteRecorder, type FinishedVoiceNote } from "../components/VoiceNoteRecorder";
import { uploadedFileUrls } from "../lib/studyFiles";
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
  xLog?: boolean;
  yLog?: boolean;
  dataCsv: string;
}

const NO_CHARTS: Chart[] = []; // stable identity so the figure memo doesn't churn before the study loads

interface StudyDetail {
  id: number;
  slug: string;
  title: string;
  body: string;
  status: "IN_PROGRESS" | "COMPLETE";
  owner: { id: number; username: string };
  channel: { slug: string; name: string; kind: "BRANCH" | "DISCUSSION"; branch: { slug: string } | null } | null;
  files: (StudyFileInfo & { url: string })[];
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
  const [chartForm, setChartForm] = useState({ title: "", kind: "LINE" as Chart["kind"], xLabel: "", yLabel: "", xLog: false, yLog: false, dataCsv: "" });
  const [pendingDraft, setPendingDraft] = useState<StudyDraft | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [showChatPicker, setShowChatPicker] = useState(false);
  const [sessionFiles, setSessionFiles] = useState<UploadedStudyFile[]>([]); // files added since the page loaded, so their cards can show a name and size straight away
  const [editingChartId, setEditingChartId] = useState<number | null>(null);

  useDocumentTitle(study?.title ?? "Study");
  const figs = useFigures(study?.charts ?? NO_CHARTS);

  function reload() {
    if (!slug) return;
    api<StudyDetail>(`/api/studies/${slug}`).then(setStudy);
  }
  useEffect(reload, [slug]);

  const isOwner = !!(user && study && (user.id === study.owner.id || user.isAdmin));

  // Clips cited by notes, grouped by the recording they slice. Audio blocks use them to mark
  // regions on the waveform (authors) or list clip buttons (readers).
  const clipsByUrl = useMemo(() => {
    const map = new Map<string, EvidenceClip[]>();
    (study?.annotations ?? []).forEach((a, i) => {
      const clip = parseClip(a.text);
      if (!clip) return;
      const list = map.get(clip.url) ?? [];
      list.push({ n: i + 1, clip, label: stripClip(a.text) });
      map.set(clip.url, list);
    });
    return map;
  }, [study?.annotations]);
  const addClipNote = useCallback(
    async (clip: Clip, label: string) => {
      await addAnnotationText(`${label} ${formatClip(clip)}`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [study?.slug],
  );
  const addClipNotes = useCallback(
    async (items: { clip: Clip; label: string }[]) => {
      await addAnnotationsBatch(items.map((i) => `${i.label} ${formatClip(i.clip)}`));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [study?.slug],
  );
  // A measured figure from the audio tools: added as a chart, and named the way the Figures tray will name it.
  const addAnalysisChart = useCallback(
    async (chart: AnalysisChart): Promise<string> => {
      if (!study) throw new Error("study not loaded");
      const numbered = numberCharts([...study.charts, { id: -1, kind: chart.kind }]);
      const last = numbered[numbered.length - 1];
      await api(`/api/studies/${study.slug}/charts`, { method: "POST", body: JSON.stringify(chart) });
      reload();
      return `${last.kind === "fig" ? "Figure" : "Table"} ${last.n}`;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [study?.slug, study?.charts],
  );
  const uploadFile = useCallback((blob: Blob, filename: string) => uploadStudyFile(study?.slug ?? "", blob, filename), [study?.slug]);
  const renderAudio = useCallback(
    (url: string) => <AudioEvidence url={url} canCite={isOwner} clips={clipsByUrl.get(url) ?? []} onCite={addClipNote} onCiteMany={addClipNotes} onAnalysisChart={addAnalysisChart} uploadFile={uploadFile} />,
    [isOwner, clipsByUrl, addClipNote, addClipNotes, addAnalysisChart, uploadFile],
  );
  useEffect(() => stopClip, []); // leaving the page silences any clip that's playing

  const isDirty = !!study && editing && differsFromSaved({ title: draftTitle.trim(), body: draftBody }, study);

  // A draft left behind by a closed tab or a crash: offer to pick it back up.
  useEffect(() => {
    if (!study || editing || !isOwner) return;
    const d = loadDraft(study.slug);
    setPendingDraft(d && differsFromSaved(d, study) ? d : null);
  }, [study, editing, isOwner]);

  // Keep a local copy of unsaved edits as they happen.
  useEffect(() => {
    if (!editing || !study) return;
    const t = setTimeout(() => {
      if (differsFromSaved({ title: draftTitle.trim(), body: draftBody }, study)) saveDraft(study.slug, { title: draftTitle, body: draftBody, base: study.body, savedAt: Date.now() });
      else clearDraft(study.slug);
    }, 400);
    return () => clearTimeout(t);
  }, [editing, draftTitle, draftBody, study]);

  // Leaving the page with unsaved edits asks first. (The local draft still survives, but the prompt is cheap insurance.)
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  function startEdit(fromDraft?: StudyDraft) {
    if (!study) return;
    setDraftTitle(fromDraft?.title ?? study.title);
    setDraftBody(fromDraft?.body ?? study.body);
    setPendingDraft(null);
    setShowHistory(false);
    setEditing(true);
  }

  function cancelEdit() {
    if (study && isDirty && !confirm("Discard your unsaved changes?")) return;
    if (study) clearDraft(study.slug);
    setEditing(false);
  }

  async function saveEdit() {
    if (!study) return;
    if (!draftTitle.trim()) {
      useToastStore.getState().showToast("Give the study a title first");
      return;
    }
    await api(`/api/studies/${study.slug}`, { method: "PATCH", body: JSON.stringify({ title: draftTitle.trim(), body: draftBody }) });
    clearDraft(study.slug);
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

  async function addAnnotationText(text: string) {
    if (!study || !text.trim()) return;
    await api(`/api/studies/${study.slug}/annotations`, { method: "POST", body: JSON.stringify({ text: text.trim() }) });
    reload();
  }

  // Several notes at once (label import): posted in order, one refresh at the end instead of one per note.
  async function addAnnotationsBatch(texts: string[]) {
    if (!study) return;
    for (const text of texts) await api(`/api/studies/${study.slug}/annotations`, { method: "POST", body: JSON.stringify({ text }) });
    reload();
  }

  async function addAnnotation() {
    await addAnnotationText(newAnnotation);
    setNewAnnotation("");
  }

  // Footnote markers in the body are just numbers, so deleting or
  // reordering notes would silently re-point every [n]. Rewrite them in
  // step - both the saved body and, if open, the editor's draft.
  async function rewriteBody(rewrite: (body: string) => string) {
    if (!study) return;
    const nextSaved = rewrite(study.body);
    if (nextSaved !== study.body) await api(`/api/studies/${study.slug}`, { method: "PATCH", body: JSON.stringify({ body: nextSaved }) });
    if (editing) setDraftBody((d) => rewrite(d));
  }
  async function remapBody(map: (n: number) => number | null) {
    await rewriteBody((b) => remapMarkers(b, map));
  }
  // Figure/table numbers are positional too: reordering, deleting, or switching a
  // chart to a table renumbers things, so every {fig:N} in the text follows.
  async function renumberFigures(afterCharts: Chart[]) {
    if (!study) return;
    const remap = figureRefRemap(numberCharts(study.charts), numberCharts(afterCharts));
    await rewriteBody((b) => remapFigureRefs(b, remap));
  }

  async function saveAnnotationEdit(id: number) {
    if (!annotationDraft.trim()) return;
    await api(`/api/study-annotations/${id}`, { method: "PATCH", body: JSON.stringify({ text: annotationDraft.trim() }) });
    setEditingAnnotationId(null);
    reload();
  }

  async function deleteAnnotation(id: number) {
    if (!study) return;
    const index = study.annotations.findIndex((a) => a.id === id);
    await api(`/api/study-annotations/${id}`, { method: "DELETE" });
    if (index !== -1) await remapBody(noteDeletionMap(index + 1, study.annotations.length));
    reload();
  }

  async function moveAnnotation(index: number, direction: -1 | 1) {
    if (!study) return;
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= study.annotations.length) return;
    const reordered = [...study.annotations];
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
    await api(`/api/studies/${study.slug}/annotations/reorder`, { method: "POST", body: JSON.stringify({ annotationIds: reordered.map((a) => a.id) }) });
    await remapBody(noteSwapMap(index + 1, swapWith + 1, study.annotations.length));
    reload();
  }

  function startAddChart() {
    setChartForm({ title: "", kind: "LINE", xLabel: "", yLabel: "", xLog: false, yLog: false, dataCsv: "x,y\n1,2\n2,4\n3,3" });
    setEditingChartId(null);
    setAddingChart(true);
  }

  function startEditChart(c: Chart) {
    setChartForm({ title: c.title, kind: c.kind, xLabel: c.xLabel ?? "", yLabel: c.yLabel ?? "", xLog: !!c.xLog, yLog: !!c.yLog, dataCsv: c.dataCsv });
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
      xLog: chartForm.xLog,
      yLog: chartForm.yLog,
      dataCsv: chartForm.dataCsv,
    });
    if (editingChartId) {
      await api(`/api/study-charts/${editingChartId}`, { method: "PATCH", body });
      await renumberFigures(study.charts.map((c) => (c.id === editingChartId ? { ...c, kind: chartForm.kind } : c)));
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
    if (study) await renumberFigures(study.charts.filter((c) => c.id !== id));
    reload();
  }

  async function moveChart(index: number, direction: -1 | 1) {
    if (!study) return;
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= study.charts.length) return;
    const reordered = [...study.charts];
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
    await api(`/api/studies/${study.slug}/charts/reorder`, { method: "POST", body: JSON.stringify({ chartIds: reordered.map((c) => c.id) }) });
    await renumberFigures(reordered);
    reload();
  }

  if (!study) return <p>Loading...</p>;

  // A voice note becomes a dated entry in the study: its file is attached to the study and a heading plus audio block are added to the end.
  async function addVoiceNote(note: FinishedVoiceNote) {
    if (!study) return;
    const url = await uploadStudyFile(study.slug, note.blob, "voice-note.m4a");
    const stamp = note.recordedAt.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); // when it was recorded, not when processing finished
    const entry = `### Voice note · ${stamp}\n\n@audio(${url})\n`;
    const body = study.body.trim() ? `${study.body.replace(/\s+$/, "")}\n\n${entry}` : entry;
    await api(`/api/studies/${study.slug}`, { method: "PATCH", body: JSON.stringify({ title: study.title, body }) });
    reload();
    setShowVoice(false);
    useToastStore.getState().showToast("Voice note added to the study");
  }

  // Files attached to the study: a card with name, size, download and (for text files) a preview.
  const fileInfo = (url: string): StudyFileInfo | null => study?.files?.find((f) => f.url === url) ?? sessionFiles.find((f) => f.url === url) ?? null;
  const renderFile = (url: string, label: string | undefined) => <StudyFile url={url} label={label} info={fileInfo(url)} />;
  const uploadFileInfo = async (blob: Blob, filename: string) => {
    const info = await uploadStudyFileInfo(study?.slug ?? "", blob, filename);
    setSessionFiles((f) => [...f, info]);
    return info;
  };

  // Which chat the study is connected to. Switching never deletes anything: the chat it leaves keeps its messages.
  async function changeChat(change: { channelSlug?: string | null; newChat?: boolean }) {
    if (!study) return;
    await api(`/api/studies/${study.slug}`, { method: "PATCH", body: JSON.stringify(change) });
    reload();
    setShowChatPicker(false);
    useToastStore.getState().showToast(change.newChat ? "Created a new chat for this study" : change.channelSlug === null ? "This study no longer has a chat" : "This study's chat has been changed");
  }
  const chatPath = (c: NonNullable<StudyDetail["channel"]>) => (c.kind === "BRANCH" && c.branch ? branchHref(c.branch.slug) : `/topic/${c.slug}`);

  const qrButton = (
    <button className="btn" title="A QR code that opens this study - for sharing or printing" onClick={() => setShowQr(true)}>
      QR
    </button>
  );

  return (
    <div className="page-column" style={{ maxWidth: editing ? 1280 : 720 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
        {editing ? (
          <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} style={{ fontSize: "1.4rem", flex: 1, minWidth: 0 }} />
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
        {isOwner && (
          <>
            {" · "}
            <button type="button" className="link-btn" onClick={() => setShowChatPicker(true)} data-testid="study-change-chat">
              {study.channel ? "change chat" : "connect a chat"}
            </button>
          </>
        )}
        {study.channel && (
          <>
            {" · "}
            <Link to={chatPath(study.channel)} data-testid="study-chat-link">discuss this study</Link>
            <span className="study-chat-name" data-testid="study-chat-name"> ({study.channel.name})</span>
            {user?.isAdmin && (
              <>
                {" · "}
                <Link to={`/admin/channels?slug=${study.channel.slug}`}>Discord link</Link>
              </>
            )}
          </>
        )}
      </p>

      {!isOwner && <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1rem" }}>{qrButton}</div>}

      {isOwner && (
        <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1rem" }}>
          {editing ? (
            <>
              <button className="btn btn-primary" onClick={saveEdit}>
                Save
              </button>
              <button className="btn" onClick={cancelEdit}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => startEdit()}>
                Edit
              </button>
              <button className="btn" onClick={() => setShowHistory((v) => !v)}>
                History
              </button>
              <button className="btn" title="Record a voice note and add it to this study as a dated entry" onClick={() => setShowVoice((v) => !v)} data-testid="study-voice-note">
                🎙 Voice note
              </button>
            </>
          )}
          {!editing && qrButton}
          <button className="btn" onClick={toggleStatus}>
            Mark as {study.status === "IN_PROGRESS" ? "complete" : "in progress"}
          </button>
          <button className="btn btn-danger" onClick={deleteStudy}>
            Delete
          </button>
        </div>
      )}

      {isOwner && !editing && pendingDraft && (
        <div className="study-draft-banner">
          You have unsaved changes from {new Date(pendingDraft.savedAt).toLocaleString()}
          {pendingDraft.base !== study.body && " - note the saved version has changed since"}.{" "}
          <button className="btn btn-primary" onClick={() => startEdit(pendingDraft)}>
            Resume editing
          </button>{" "}
          <button
            className="btn"
            onClick={() => {
              clearDraft(study.slug);
              setPendingDraft(null);
            }}
          >
            Discard
          </button>
        </div>
      )}

      {showChatPicker && study && (
        <ChannelPicker
          currentSlug={study.channel?.slug ?? null}
          onPick={(slug) => changeChat({ channelSlug: slug })}
          onNewChat={() => changeChat({ newChat: true })}
          onDisconnect={() => changeChat({ channelSlug: null })}
          onClose={() => setShowChatPicker(false)}
        />
      )}

      {showQr && (
        <QrModal
          url={`${window.location.origin}/study/${study.slug}`}
          title={study.title}
          candidateImages={uploadedFileUrls(`${study.body}\n${study.annotations.map((a) => a.text).join("\n")}`).filter((u) => /\.(png|jpe?g|webp)$/i.test(u))}
          onClose={() => setShowQr(false)}
        />
      )}

      {isOwner && !editing && showVoice && <VoiceNoteRecorder doneLabel="Add to study" onDone={addVoiceNote} onCancel={() => setShowVoice(false)} />}

      {isOwner && !editing && showHistory && (
        <StudyHistory
          slug={study.slug}
          currentTitle={study.title}
          currentBody={study.body}
          onRestored={() => {
            clearDraft(study.slug);
            setShowHistory(false);
            useToastStore.getState().showToast("Version restored ✓");
            reload();
          }}
        />
      )}

      {editing ? (
        <StudyEditor body={draftBody} onBodyChange={setDraftBody} notes={study.annotations} charts={study.charts} renderAudio={renderAudio} uploadFile={uploadFile} uploadFileInfo={uploadFileInfo} renderFile={renderFile} onAddNote={addAnnotationText} onNavigate={(path) => navigate(path)} />
      ) : (
        <>
        {extractHeadings(study.body).length >= 3 && (
          <details className="study-outline study-toc">
            <summary>Contents</summary>
            <ul>
              {extractHeadings(study.body).map((h) => (
                <li key={h.ordinal} style={{ paddingLeft: `${(h.level - 1) * 0.9}rem` }}>
                  <button type="button" onClick={() => document.getElementById(`sec-${h.ordinal}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                    {h.text}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="study-body">
          {renderMarkdown(study.body, (path) => navigate(path), { extended: true, notes: study.annotations.map((a) => a.text), figures: figs.render, figureCounts: figs.counts, audio: renderAudio, images: { editable: false }, file: renderFile })}
        </div>
        </>
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

          {study.charts.map((c, i) => {
            const num = figs.numbered[i];
            const label = num ? `${num.kind === "fig" ? "Figure" : "Table"} ${num.n}` : "";
            const placedInText = !!num && findPlacedFigures(study.body).has(`${num.kind}:${num.n}`);
            if (placedInText && !isOwner) return null; // readers see it in the text, not twice
            return (
            <div key={c.id} style={{ margin: "1rem 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <h3 style={{ fontSize: "0.85rem", margin: 0 }}>
                  <span style={{ color: "var(--accent-forum)" }}>{label}</span> · {c.title}
                  {placedInText && <span style={{ color: "var(--text-dim)", fontWeight: 400 }}> - shown in the text</span>}
                </h3>
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
              {!placedInText && <StudyChartView kind={c.kind} xLabel={c.xLabel} yLabel={c.yLabel} xLog={c.xLog} yLog={c.yLog} dataCsv={c.dataCsv} />}
            </div>
            );
          })}

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
                    {chartForm.kind !== "BAR" && (
                      <label style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <input type="checkbox" checked={chartForm.xLog} onChange={(e) => setChartForm((f) => ({ ...f, xLog: e.target.checked }))} />
                        Log X
                      </label>
                    )}
                    <label style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                      <input type="checkbox" checked={chartForm.yLog} onChange={(e) => setChartForm((f) => ({ ...f, yLog: e.target.checked }))} />
                      Log Y
                    </label>
                  </>
                )}
              </div>
              <p style={{ fontSize: "0.72rem", color: "var(--text-dim)", margin: "0 0 0.2rem" }}>
                CSV - first row is headers. First column is X (or the row label for a table); every other column is its own data series. Add a column named <code>gain_err</code> (or <code>gain±</code>) next to <code>gain</code> for error bars.
              </p>
              <textarea
                value={chartForm.dataCsv}
                onChange={(e) => setChartForm((f) => ({ ...f, dataCsv: e.target.value }))}
                rows={6}
                style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}
              />
              {chartForm.dataCsv.trim() && (
                <div style={{ marginTop: "0.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.5rem" }}>
                  <p style={{ fontSize: "0.7rem", color: "var(--text-dim)", margin: "0 0 0.3rem" }}>Preview</p>
                  <StudyChartView kind={chartForm.kind} xLabel={chartForm.xLabel || null} yLabel={chartForm.yLabel || null} xLog={chartForm.xLog} yLog={chartForm.yLog} dataCsv={chartForm.dataCsv} />
                </div>
              )}
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
          <ol style={{ paddingLeft: 0, listStyle: "none", fontSize: "0.85rem" }}>
            {study.annotations.map((a, i) => (
              <li key={a.id} id={`note-${i + 1}`} style={{ marginBottom: "0.4rem" }}>
                {editingAnnotationId === a.id ? (
                  <div style={{ display: "flex", gap: "0.3rem" }}>
                    <input value={annotationDraft} onChange={(e) => setAnnotationDraft(e.target.value)} style={{ flex: 1, fontSize: "0.85rem" }} />
                    <button className="btn btn-primary" style={{ fontSize: "0.75rem" }} onClick={() => saveAnnotationEdit(a.id)}>
                      save
                    </button>
                  </div>
                ) : (
                  <span>
                    <b style={{ color: "var(--accent-forum)" }}>[{i + 1}]</b> {renderInlineMarkdown(a.text, (path) => navigate(path))}
                    {parseClip(a.text)?.img && (
                      <a href={parseClip(a.text)!.img!} target="_blank" rel="noreferrer">
                        <img className="clip-spectrogram" src={parseClip(a.text)!.img!} alt="Spectrogram of the cited passage" loading="lazy" />
                      </a>
                    )}
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
