import { useEffect, useState } from "react";
import { api } from "../../lib/api";

interface StorageAttachment {
  id: number;
  filename: string;
  mimeType: string;
  sizeBytes: string;
  url: string;
  uploader: string;
  channel: string | null;
  createdAt: string;
}

function formatSize(bytes: string): string {
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function StorageAdminPage() {
  const [attachments, setAttachments] = useState<StorageAttachment[]>([]);
  const [archiveOrgPrefix, setArchiveOrgPrefix] = useState("");
  const [migratingId, setMigratingId] = useState<number | null>(null);
  const [migratingAll, setMigratingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api<StorageAttachment[]>("/api/admin/storage/attachments").then(setAttachments);
  }

  useEffect(load, []);

  const totalSize = attachments.reduce((sum, a) => sum + Number(a.sizeBytes), 0);

  async function migrateOne(id: number) {
    if (!archiveOrgPrefix) {
      setError("Enter an archive.org URL prefix first.");
      return;
    }
    setError(null);
    setMigratingId(id);
    try {
      await api(`/api/admin/storage/attachments/${id}/migrate`, { method: "POST", body: JSON.stringify({ archiveOrgPrefix }) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "migration failed");
    } finally {
      setMigratingId(null);
    }
  }

  async function migrateAll() {
    if (!archiveOrgPrefix) {
      setError("Enter an archive.org URL prefix first.");
      return;
    }
    if (
      !confirm(
        `Replace all ${attachments.length} local attachments with archive.org links using this prefix? Files not found under this prefix (mismatched filenames) will silently stay pointed at their old — now possibly missing — local path.`,
      )
    )
      return;
    setError(null);
    setMigratingAll(true);
    try {
      const result = await api<{ migrated: number; failed: number }>("/api/admin/storage/migrate-all", {
        method: "POST",
        body: JSON.stringify({ archiveOrgPrefix }),
      });
      alert(`Migrated ${result.migrated}, failed ${result.failed}.`);
      load();
    } finally {
      setMigratingAll(false);
    }
  }

  function downloadAll() {
    attachments.forEach((a, i) => {
      setTimeout(() => {
        const link = document.createElement("a");
        link.href = a.url;
        link.download = a.filename;
        link.click();
      }, i * 300); // stagger so the browser doesn't block a burst of simultaneous downloads
    });
  }

  return (
    <div>
      <h1>Storage</h1>
      <p style={{ color: "var(--text-dim)" }}>
        {attachments.length} attachments hosted locally, {formatSize(String(totalSize))} total. Attachments already
        pointed at an external URL (archive.org or otherwise) aren't shown here — there's nothing to migrate.
      </p>

      <div className="field" style={{ maxWidth: 480 }}>
        <label htmlFor="archive-prefix">Archive.org URL prefix</label>
        <input
          id="archive-prefix"
          placeholder="https://archive.org/download/your-item-name"
          value={archiveOrgPrefix}
          onChange={(e) => setArchiveOrgPrefix(e.target.value)}
        />
        <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.2rem" }}>
          Matches each attachment by its exact filename appended to this prefix — only works if you uploaded it to
          that archive.org item preserving the original filename.
        </p>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button className="btn" onClick={downloadAll} disabled={attachments.length === 0}>
          Download all
        </button>
        <button className="btn btn-primary" onClick={migrateAll} disabled={attachments.length === 0 || migratingAll}>
          {migratingAll ? "Migrating…" : "Replace all with archive.org"}
        </button>
      </div>

      {error && <p style={{ color: "var(--accent-danger)" }}>{error}</p>}

      <table>
        <thead>
          <tr>
            <th>Filename</th>
            <th>Size</th>
            <th>Uploader</th>
            <th>Channel</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {attachments.map((a) => (
            <tr key={a.id}>
              <td>{a.filename}</td>
              <td className="mono">{formatSize(a.sizeBytes)}</td>
              <td>{a.uploader}</td>
              <td>{a.channel ?? "—"}</td>
              <td style={{ display: "flex", gap: "0.4rem" }}>
                <a className="btn" href={a.url} download={a.filename}>
                  Download
                </a>
                <button className="btn btn-primary" onClick={() => migrateOne(a.id)} disabled={migratingId === a.id}>
                  {migratingId === a.id ? "…" : "Replace"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
