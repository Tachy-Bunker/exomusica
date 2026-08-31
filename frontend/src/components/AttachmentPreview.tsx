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

  if (kind === "image") {
    return (
      <a href={attachment.url} target="_blank" rel="noreferrer">
        <img src={attachment.url} alt={attachment.filename} style={{ maxWidth: 320, maxHeight: 240, borderRadius: "var(--radius)", display: "block", marginTop: "0.3rem" }} />
      </a>
    );
  }
  if (kind === "audio") {
    return <audio controls src={attachment.url} style={{ display: "block", marginTop: "0.3rem", maxWidth: 320 }} />;
  }
  if (kind === "video") {
    return <video controls src={attachment.url} style={{ display: "block", marginTop: "0.3rem", maxWidth: 320, borderRadius: "var(--radius)" }} />;
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
