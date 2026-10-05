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
  communityTrack: string | null;
  communityAlbumCover: string | null;
  createdAt: string;
}

interface ReclaimReport {
  items: { id: number; filename: string; sizeBytes: string; uploader: string; reason: "deleted-message" | "never-posted"; external: boolean }[];
  orphanFiles: { name: string; sizeBytes: number }[];
  totals: { deletedMessage: number; neverPosted: number; orphanFiles: number; bytes: string };
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
  const [report, setReport] = useState<ReclaimReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [reclaiming, setReclaiming] = useState(false);

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
        `Replace all ${attachments.length} local attachments with archive.org links using this prefix? Files not found under this prefix (mismatched filenames) will silently stay pointed at their old - now possibly missing - local path.`,
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

  async function scan() {
    setError(null);
    setScanning(true);
    try {
      setReport(await api<ReclaimReport>("/api/admin/storage/reclaimable"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function reclaimNow() {
    if (!report) return;
    const n = report.items.length + report.orphanFiles.length;
    if (!confirm(`Permanently delete ${n} unused file${n === 1 ? "" : "s"} (${formatSize(report.totals.bytes)})? This can't be undone.`)) return;
    setReclaiming(true);
    try {
      const done = await api<{ attachments: number; orphanFiles: number; failed: number }>("/api/admin/storage/reclaim", { method: "POST", body: JSON.stringify({ confirm: true }) });
      alert(`Removed ${done.attachments} attachment${done.attachments === 1 ? "" : "s"} and ${done.orphanFiles} stray file${done.orphanFiles === 1 ? "" : "s"}${done.failed ? ` (${done.failed} failed)` : ""}.`);
      setReport(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "cleanup failed");
    } finally {
      setReclaiming(false);
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

      <section style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.8rem", marginBottom: "1.2rem", maxWidth: 720 }}>
        <h2 style={{ fontSize: "1rem", marginTop: 0 }}>1. Reclaim unused files</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
          Files that belong to deleted chat messages, uploads that were never posted, and stray files nothing refers to. Do this <b>before</b> downloading
          for archive.org so the clutter doesn't come along. Scanning only looks; nothing is deleted until you confirm.
        </p>
        <button className="btn" onClick={scan} disabled={scanning}>
          {scanning ? "Scanning…" : "Scan for unused files"}
        </button>
        {report && report.items.length + report.orphanFiles.length === 0 && <p style={{ color: "var(--accent-forum)" }}>Nothing to reclaim ✓</p>}
        {report && report.items.length + report.orphanFiles.length > 0 && (
          <div style={{ marginTop: "0.8rem" }}>
            <p style={{ fontSize: "0.9rem" }}>
              <b>{formatSize(report.totals.bytes)}</b> in {report.items.length + report.orphanFiles.length} files: {report.totals.deletedMessage} from deleted messages,{" "}
              {report.totals.neverPosted} never-posted uploads, {report.totals.orphanFiles} stray files on disk.
            </p>
            <ul style={{ fontSize: "0.8rem", maxHeight: 180, overflowY: "auto", paddingLeft: "1.1rem" }}>
              {report.items.slice(0, 60).map((i) => (
                <li key={i.id}>
                  {i.filename} · {formatSize(i.sizeBytes)} · {i.uploader} · {i.reason === "deleted-message" ? "deleted message" : "never posted"}
                  {i.external && " · already on archive.org (only the record is removed)"}
                </li>
              ))}
              {report.orphanFiles.slice(0, 20).map((o) => (
                <li key={o.name}>
                  {o.name} · {formatSize(String(o.sizeBytes))} · stray file
                </li>
              ))}
            </ul>
            <button className="btn btn-primary" onClick={reclaimNow} disabled={reclaiming}>
              {reclaiming ? "Deleting…" : `Delete these ${report.items.length + report.orphanFiles.length} files`}
            </button>
          </div>
        )}
      </section>

      <h2 style={{ fontSize: "1rem" }}>2. Move to archive.org</h2>
      <p style={{ color: "var(--text-dim)" }}>
        {attachments.length} attachments hosted locally, {formatSize(String(totalSize))} total. Unused files (see above) and files inside studies are left out: a study's
        files stay on this server because their links are part of the study's text. Attachments already pointed at an external URL aren't shown - there's nothing to migrate.
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
          Matches each attachment by its exact filename appended to this prefix - only works if you uploaded it to
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
              <td>{a.channel ?? a.communityTrack ?? a.communityAlbumCover ?? "-"}</td>
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
