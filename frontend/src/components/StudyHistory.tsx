import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import { diffStats, diffText, type DiffSegment } from "../lib/diff";
import { findMissingFiles, uploadedFileUrls } from "../lib/studyFiles";

interface RevisionSummary {
  id: number;
  label: string | null;
  title: string;
  createdAt: string;
  author: { username: string } | null;
}
interface RevisionFull extends RevisionSummary {
  body: string;
}

interface Props {
  slug: string;
  currentTitle: string;
  currentBody: string;
  onRestored: () => void;
}

/** Long unchanged stretches collapse to a couple of lines of context either side of the changes. */
function collapse(segments: DiffSegment[]): { key: number; type: DiffSegment["type"] | "gap"; text: string }[] {
  const out: { key: number; type: DiffSegment["type"] | "gap"; text: string }[] = [];
  segments.forEach((seg, i) => {
    if (seg.type !== "same") {
      out.push({ key: i, type: seg.type, text: seg.text });
      return;
    }
    const lines = seg.text.split("\n"); // last element is "" because segments end in a newline
    if (lines.length <= 9) {
      out.push({ key: i, type: "same", text: seg.text });
      return;
    }
    const first = i === 0;
    const last = i === segments.length - 1;
    const head = first ? [] : lines.slice(0, 3);
    const tail = last ? [] : lines.slice(-4); // includes the trailing ""
    const hidden = lines.length - head.length - tail.length;
    if (head.length) out.push({ key: i * 10, type: "same", text: head.join("\n") + "\n" });
    out.push({ key: i * 10 + 1, type: "gap", text: `⋯ ${hidden} unchanged line${hidden === 1 ? "" : "s"} ⋯\n` });
    if (tail.length) out.push({ key: i * 10 + 2, type: "same", text: tail.join("\n") });
  });
  return out;
}

export function StudyHistory({ slug, currentTitle, currentBody, onRestored }: Props) {
  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<RevisionFull | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [missingFiles, setMissingFiles] = useState<string[]>([]);

  useEffect(() => {
    api<RevisionSummary[]>(`/api/studies/${slug}/revisions`)
      .then(setRevisions)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load history"));
  }, [slug]);

  useEffect(() => {
    if (selectedId === null) {
      setSelected(null);
      return;
    }
    let cancelled = false;
    api<RevisionFull>(`/api/study-revisions/${selectedId}`)
      .then((r) => !cancelled && setSelected(r))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Couldn't load that version"));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Files are cleaned up when whatever used them is removed, so an old version can point at audio or images that no longer exist.
  useEffect(() => {
    setMissingFiles([]);
    if (!selected) return;
    let cancelled = false;
    void findMissingFiles(uploadedFileUrls(selected.body)).then((m) => !cancelled && setMissingFiles(m));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  // Diff FROM the current text TO the chosen version: what you'd see change if you restored it.
  const segments = useMemo(() => (selected ? diffText(currentBody, selected.body) : []), [selected, currentBody]);
  const stats = useMemo(() => diffStats(segments), [segments]);
  const shown = useMemo(() => collapse(segments), [segments]);
  const identical = selected !== null && stats.added === 0 && stats.removed === 0 && selected.title === currentTitle;

  async function restore() {
    if (!selected) return;
    if (!confirm("Restore this version? Your current text is saved in the history first, so you can undo this.")) return;
    setRestoring(true);
    try {
      await api(`/api/study-revisions/${selected.id}/restore`, { method: "POST" });
      onRestored();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Restore failed");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="study-history">
      <div className="history-list">
        <div className="study-pane-head">
          <span>Versions</span>
        </div>
        {error && <p style={{ fontSize: "0.8rem", color: "var(--accent-forum)" }}>{error}</p>}
        {revisions === null && !error && <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Loading…</p>}
        {revisions?.length === 0 && <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>No history yet - versions are recorded each time you save.</p>}
        {revisions?.map((r, i) => (
          <button key={r.id} type="button" className={`history-item${selectedId === r.id ? " selected" : ""}`} onClick={() => setSelectedId(r.id)}>
            <span>{new Date(r.createdAt).toLocaleString()}</span>
            <span className="history-meta">
              {i === 0 ? "latest" : r.label ?? ""}
              {r.author ? ` · ${r.author.username}` : ""}
            </span>
          </button>
        ))}
      </div>

      <div className="history-detail">
        {!selected && <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>Pick a version to see what restoring it would change.</p>}
        {selected && (
          <>
            <div className="study-pane-head">
              <span style={{ textTransform: "none", letterSpacing: 0, fontSize: "0.82rem", color: "var(--text)" }}>
                {identical ? "Identical to the current text" : `Restoring would add ${stats.added} word${stats.added === 1 ? "" : "s"} and remove ${stats.removed}`}
                {selected.title !== currentTitle && ` · title becomes “${selected.title}”`}
              </span>
              <button type="button" className="btn btn-primary" disabled={restoring || identical} onClick={restore}>
                {restoring ? "Restoring…" : "Restore this version"}
              </button>
            </div>
            {missingFiles.length > 0 && (
              <p className="history-warning">
                ⚠ This version refers to {missingFiles.length} file{missingFiles.length === 1 ? "" : "s"} (audio or images) that {missingFiles.length === 1 ? "was" : "were"} deleted when{" "}
                {missingFiles.length === 1 ? "it" : "they"} stopped being used. Restoring brings the text back, but {missingFiles.length === 1 ? "that file" : "those files"} will show as missing.
              </p>
            )}
            <pre className="history-diff">
              {shown.map((s) =>
                s.type === "add" ? (
                  <ins key={s.key}>{s.text}</ins>
                ) : s.type === "del" ? (
                  <del key={s.key}>{s.text}</del>
                ) : s.type === "gap" ? (
                  <span key={s.key} className="history-gap">
                    {s.text}
                  </span>
                ) : (
                  <span key={s.key}>{s.text}</span>
                ),
              )}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}
