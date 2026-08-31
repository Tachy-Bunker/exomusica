import { useEffect, useState } from "react";
import { api } from "../../lib/api";

interface Template {
  type: string;
  subject: string;
  bodyHtml: string;
  tokens: string[];
  isCustomized: boolean;
}

export function EmailTemplatesAdminPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState({ subject: "", bodyHtml: "" });
  const [broadcast, setBroadcast] = useState({ type: "CALL_FOR_IDEAS", subject: "", body: "" });
  const [status, setStatus] = useState<string | null>(null);

  function load() {
    api<Template[]>("/api/admin/email-templates").then(setTemplates);
  }
  useEffect(load, []);

  function select(t: Template) {
    setSelected(t.type);
    setDraft({ subject: t.subject, bodyHtml: t.bodyHtml });
  }

  async function save() {
    if (!selected) return;
    await api(`/api/admin/email-templates/${selected}`, { method: "PUT", body: JSON.stringify(draft) });
    setStatus("Saved.");
    load();
  }

  async function revert() {
    if (!selected) return;
    await api(`/api/admin/email-templates/${selected}`, { method: "DELETE" });
    setStatus("Reverted to default.");
    load();
    setSelected(null);
  }

  async function sendBroadcast() {
    const result = await api<{ notified: number }>("/api/admin/broadcast", {
      method: "POST",
      body: JSON.stringify(broadcast),
    });
    alert(`Sent to ${result.notified} recipient${result.notified === 1 ? "" : "s"}.`);
  }

  const current = templates.find((t) => t.type === selected);

  return (
    <div>
      <h1>Email templates</h1>
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "1.5rem" }}>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {templates.map((t) => (
            <li key={t.type} style={{ marginBottom: "0.3rem" }}>
              <button
                className={`btn ${selected === t.type ? "btn-primary" : ""}`}
                style={{ width: "100%", textAlign: "left" }}
                onClick={() => select(t)}
              >
                {t.type} {t.isCustomized && "•"}
              </button>
            </li>
          ))}
        </ul>

        <div>
          {!selected && <p style={{ color: "var(--text-dim)" }}>Pick an email type to edit.</p>}
          {current && (
            <>
              <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
                Available tokens: {current.tokens.map((t) => `{{${t}}}`).join(", ")}
              </p>
              <div className="field">
                <label>Subject</label>
                <input value={draft.subject} onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))} />
              </div>
              <div className="field">
                <label>Body (HTML)</label>
                <textarea
                  rows={10}
                  value={draft.bodyHtml}
                  onChange={(e) => setDraft((d) => ({ ...d, bodyHtml: e.target.value }))}
                  className="mono"
                />
              </div>
              {status && <p style={{ fontSize: "0.85rem" }}>{status}</p>}
              <button className="btn btn-primary" onClick={save}>
                Save
              </button>{" "}
              {current.isCustomized && (
                <button className="btn" onClick={revert}>
                  Revert to default
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <hr style={{ margin: "2rem 0", borderColor: "var(--border)" }} />

      <h2 style={{ fontSize: "1rem" }}>Send a broadcast</h2>
      <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
        Goes to every member with that notification type enabled. Uses the CALL_FOR_IDEAS / CALL_FOR_ARTISTS
        template above for the wrapping — subject and body here fill its {"{{subject}}"} / {"{{body}}"} tokens.
      </p>
      <div className="field">
        <select value={broadcast.type} onChange={(e) => setBroadcast((b) => ({ ...b, type: e.target.value }))}>
          <option value="CALL_FOR_IDEAS">Call for ideas</option>
          <option value="CALL_FOR_ARTISTS">Call for artists</option>
        </select>
      </div>
      <div className="field">
        <input
          placeholder="Subject"
          value={broadcast.subject}
          onChange={(e) => setBroadcast((b) => ({ ...b, subject: e.target.value }))}
        />
      </div>
      <div className="field">
        <textarea
          placeholder="Body"
          rows={4}
          value={broadcast.body}
          onChange={(e) => setBroadcast((b) => ({ ...b, body: e.target.value }))}
        />
      </div>
      <button className="btn btn-primary" onClick={sendBroadcast}>
        Send broadcast
      </button>
    </div>
  );
}
