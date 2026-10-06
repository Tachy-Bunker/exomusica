import { useState } from "react";
import { api } from "../lib/api";
import { fileIcon, formatBytes, isTextName } from "../lib/fileKinds";
import { isUploadingUrl } from "../lib/images";

export interface StudyFileInfo {
  id: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

interface Props {
  url: string;
  label?: string;
  info?: StudyFileInfo | null;
}

/** A file attached to a study: its name and size, a download button, and (for text files) a preview. */
export function StudyFile({ url, label, info }: Props) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ text: string; truncated: boolean; size: number } | { error: string } | "loading" | null>(null);

  if (isUploadingUrl(url)) {
    return <div className="study-file study-file-pending">⏳ Uploading {label || "file"}…</div>;
  }
  const name = info?.filename ?? (label || decodeURIComponent(url.split("/").pop() ?? url));
  const canPreview = !!info && isTextName(info.filename, info.mimeType);
  const href = info ? `/api/study-files/${info.id}/download` : url;

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (state && state !== "loading" && !("error" in state)) return; // already loaded
    setState("loading");
    try {
      const r = await api<{ text: string; truncated: boolean; sizeBytes: number }>(`/api/study-files/${info!.id}/text`);
      setState({ text: r.text, truncated: r.truncated, size: r.sizeBytes });
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : "The preview couldn't be loaded." });
    }
  }

  return (
    <div className="study-file" data-testid="study-file">
      <div className="study-file-row">
        <span className="study-file-icon" aria-hidden="true">
          {fileIcon(name)}
        </span>
        <span className="study-file-name" title={name}>
          {name}
        </span>
        {info && <span className="study-file-size">{formatBytes(info.sizeBytes)}</span>}
        <a className="btn" href={href} download={name} data-testid="study-file-download">
          Download
        </a>
        {canPreview && (
          <button type="button" className="btn" onClick={() => void toggle()} aria-expanded={open} data-testid="study-file-preview">
            {open ? "Hide" : "Preview"}
          </button>
        )}
      </div>
      {open && state === "loading" && <p className="study-file-note">Loading…</p>}
      {open && state && typeof state === "object" && "error" in state && <p className="study-file-note study-file-error">{state.error}</p>}
      {open && state && typeof state === "object" && "text" in state && (
        <>
          <pre className="file-preview" data-testid="study-file-text" tabIndex={0}>
            {state.text}
          </pre>
          {state.truncated && <p className="study-file-note">Showing the first 256 KB of {formatBytes(state.size)}. Download the file to read the rest.</p>}
        </>
      )}
    </div>
  );
}
