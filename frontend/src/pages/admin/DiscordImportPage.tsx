import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

interface ChannelOption {
  slug: string;
  name: string;
}

interface ImportSummary {
  imported: number;
  skippedSystem: number;
  skippedDuplicate: number;
  attachmentsResolved: number;
  attachmentsMissing: number;
}

export function DiscordImportPage() {
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [channelSlug, setChannelSlug] = useState("");
  const [archiveOrgPrefix, setArchiveOrgPrefix] = useState("");
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<ChannelOption[]>("/api/channels").then(setChannels);
  }, []);

  async function runImport() {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !channelSlug) return;
    setRunning(true);
    setError(null);
    setSummary(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("channelSlug", channelSlug);
      if (archiveOrgPrefix) formData.append("archiveOrgPrefix", archiveOrgPrefix);
      const result = await api<ImportSummary>("/api/admin/import/discord-csv", { method: "POST", body: formData });
      setSummary(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "import failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h1>Discord import</h1>
      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>
        Import a DiscordChatExporter CSV into a channel as if the conversation happened here. Authors without a
        matching account become "ghost" users (attributed but unable to log in) until they claim their account.
        Dragging in a newer export of the same channel later is safe — messages already imported are skipped
        automatically, so only new ones get added.
      </p>
      <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
        Not imported from this CSV format: replies (no reply-reference column) and reactions (no per-user
        attribution, only an emoji + count).
      </p>

      <div className="field">
        <label htmlFor="channel">Target channel</label>
        <select id="channel" value={channelSlug} onChange={(e) => setChannelSlug(e.target.value)}>
          <option value="">— choose a channel —</option>
          {channels.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name} ({c.slug})
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="csv-file">CSV file</label>
        <input ref={fileInputRef} id="csv-file" type="file" accept=".csv" />
      </div>

      <div className="field">
        <label htmlFor="archive-prefix">Archive.org URL prefix for attachments (optional)</label>
        <input
          id="archive-prefix"
          placeholder="https://archive.org/download/your-item-name"
          value={archiveOrgPrefix}
          onChange={(e) => setArchiveOrgPrefix(e.target.value)}
        />
        <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.2rem" }}>
          Only works if you uploaded every attachment to that archive.org item preserving its original filename —
          the tool matches each CSV attachment by filename and appends it to this prefix. Leave blank to skip
          attachments entirely for this import.
        </p>
      </div>

      <button className="btn btn-primary" onClick={runImport} disabled={!channelSlug || running}>
        {running ? "Importing…" : "Run import"}
      </button>

      {error && <p style={{ color: "var(--accent-danger)", marginTop: "0.8rem" }}>{error}</p>}

      {summary && (
        <div style={{ marginTop: "1rem", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.8rem" }}>
          <strong>Import complete</strong>
          <ul style={{ marginTop: "0.4rem" }}>
            <li>Messages imported: {summary.imported}</li>
            <li>Skipped (system messages): {summary.skippedSystem}</li>
            <li>Skipped (already imported): {summary.skippedDuplicate}</li>
            <li>Attachments resolved: {summary.attachmentsResolved}</li>
            <li>Attachments missing: {summary.attachmentsMissing}</li>
          </ul>
        </div>
      )}
    </div>
  );
}
