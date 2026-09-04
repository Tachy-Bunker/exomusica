import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

interface Subscription {
  id: string;
  email: string;
  confirmed?: boolean;
  subscribed: boolean;
  source: "form" | "account";
  username?: string;
  createdAt: string;
}

export function NewsletterAdminPage() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [pastedList, setPastedList] = useState("");
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    api<Subscription[]>("/api/admin/newsletter-subscriptions").then(setSubs);
  }
  useEffect(load, []);

  async function toggleSubscribed(s: Subscription) {
    await api(`/api/admin/newsletter-subscriptions/${s.id}`, { method: "PATCH", body: JSON.stringify({ subscribed: !s.subscribed }) });
    setSubs((prev) => prev.map((x) => (x.id === s.id ? { ...x, subscribed: !x.subscribed } : x)));
  }

  async function removeSubscriber(s: Subscription) {
    if (!confirm(`Permanently remove ${s.email}? This deletes the record entirely — use the checkbox instead if you just want to pause emails.`)) return;
    await api(`/api/admin/newsletter-subscriptions/${s.id}`, { method: "DELETE" });
    setSubs((prev) => prev.filter((x) => x.id !== s.id));
  }

  function exportTxt() {
    const text = subs.filter((s) => s.subscribed).map((s) => s.email).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setPastedList((prev) => (prev ? prev + "\n" + text : text));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function saveImport() {
    const emails = pastedList.split(/[\n,]/).map((e) => e.trim()).filter(Boolean);
    if (emails.length === 0) return;
    const result = await api<{ added: number; skippedDuplicates: number }>("/api/admin/newsletter-subscriptions/bulk-import", {
      method: "POST",
      body: JSON.stringify({ emails }),
    });
    setImportResult(`Added ${result.added} new subscriber${result.added === 1 ? "" : "s"}, skipped ${result.skippedDuplicates} already on the list.`);
    setPastedList("");
    load();
  }

  const activeCount = subs.filter((s) => s.subscribed).length;

  return (
    <div>
      <h1>Newsletter subscribers</h1>
      <p style={{ color: "var(--text-dim)" }}>
        {activeCount} of {subs.length} currently subscribed. Includes both form signups and accounts with "Exomusica
        News" enabled in their notification preferences.
      </p>
      <button className="btn btn-primary" onClick={exportTxt} disabled={activeCount === 0} style={{ marginBottom: "1.5rem" }}>
        Export subscribed as TXT
      </button>

      <div className="field" style={{ maxWidth: 480, marginBottom: "1.5rem" }}>
        <label>Add email addresses</label>
        <textarea
          rows={4}
          style={{ width: "100%" }}
          placeholder="One email per line, or comma-separated"
          value={pastedList}
          onChange={(e) => setPastedList(e.target.value)}
        />
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem", alignItems: "center" }}>
          <input ref={fileInputRef} type="file" accept=".txt" onChange={handleFileSelect} />
          <button className="btn btn-primary" onClick={saveImport} disabled={!pastedList.trim()}>
            Save
          </button>
        </div>
        {importResult && <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>{importResult}</p>}
        <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.2rem" }}>
          Duplicates (already on the list) are skipped automatically.
        </p>
      </div>

      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Source</th>
            <th>Subscribed</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {subs.map((s) => (
            <tr key={s.id}>
              <td>{s.email}</td>
              <td className="mono">{s.source === "account" ? `account (${s.username})` : "form"}</td>
              <td>
                <input type="checkbox" checked={s.subscribed} onChange={() => toggleSubscribed(s)} />
              </td>
              <td>
                {s.source === "form" && (
                  <button className="btn btn-danger" onClick={() => removeSubscriber(s)}>
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
