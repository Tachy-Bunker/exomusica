interface AttachmentInfo {
  id: number;
  filename: string;
  url: string;
  sizeBytes: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function guessKind(filename: string): "image" | "audio" | "video" | "text" | "other" {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  if (["mp3", "wav", "ogg", "opus", "flac", "m4a", "aac"].includes(ext)) return "audio";
  if (["mp4", "webm", "mov"].includes(ext)) return "video";
  if (["txt", "md", "log"].includes(ext)) return "text";
  return "other";
}

export function AttachmentPreview({ attachment }: { attachment: AttachmentInfo }) {
  const kind = guessKind(attachment.filename);
  const filenameLabel = (
    <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "0.3rem" }}>{attachment.filename}</div>
  );

  if (kind === "image") {
    return (
      <div>
        {filenameLabel}
        <a href={attachment.url} target="_blank" rel="noreferrer">
          <img src={attachment.url} alt={attachment.filename} style={{ maxWidth: 320, maxHeight: 240, borderRadius: "var(--radius)", display: "block" }} />
        </a>
      </div>
    );
  }
  if (kind === "audio") {
    return (
      <div>
        {filenameLabel}
        <audio controls src={attachment.url} style={{ display: "block", maxWidth: 320 }} />
      </div>
    );
  }
  if (kind === "video") {
    return (
      <div>
        {filenameLabel}
        <video controls src={attachment.url} style={{ display: "block", maxWidth: 320, borderRadius: "var(--radius)" }} />
      </div>
    );
  }
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className="btn"
      style={{ display: "inline-block", marginTop: "0.3rem", fontSize: "0.8rem" }}
    >
      📎 {attachment.filename} ({formatSize(attachment.sizeBytes)})
    </a>
  );
}
