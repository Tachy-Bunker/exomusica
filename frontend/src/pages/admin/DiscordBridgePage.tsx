import { useEffect, useState } from "react";
import { api } from "../../lib/api";

export function DiscordBridgePage() {
  const [tokenSet, setTokenSet] = useState(false);
  const [status, setStatus] = useState<string>("disconnected");
  const [lastError, setLastError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState("");
  const [saved, setSaved] = useState(false);

  function loadStatus() {
    api<{ discordBotTokenSet: boolean; status: string; lastError: string | null }>("/api/admin/discord-bridge/status").then((s) => {
      setTokenSet(s.discordBotTokenSet);
      setStatus(s.status);
      setLastError(s.lastError);
    });
  }

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  async function saveToken() {
    await api("/api/admin/site-settings", { method: "PATCH", body: JSON.stringify({ discordBotToken: newToken || null }) });
    setNewToken("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setTimeout(loadStatus, 1500); // give the reconnect attempt a moment to resolve
  }

  const statusColor = status === "connected" ? "var(--accent-audio)" : status === "connecting" ? "var(--text-dim)" : "var(--accent-danger)";
  const statusLabel =
    status === "connected" ? "Connected" : status === "connecting" ? "Connecting…" : status === "error" ? "Error" : "Disconnected";

  return (
    <div style={{ maxWidth: 560 }}>
      <h1>Discord bridge</h1>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: statusColor, display: "inline-block" }} />
        <strong>{statusLabel}</strong>
      </div>
      {lastError && (
        <p style={{ color: "var(--accent-danger)", fontSize: "0.85rem", maxWidth: 560, wordBreak: "break-word" }}>
          Last error: {lastError}
        </p>
      )}
      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>
        Bridges a forum topic to a Discord channel, both ways. Website messages post to Discord as a webhook message
        named "{"{username}"} | Exo-API" (if you set a webhook below for that topic) or a plain bot message prefixed
        with "{"{username}"}: " otherwise. Discord messages import back as a ghost account — link one to a real
        account from Users, same as a CSV import.
      </p>

      <div className="field">
        <label>Bot token</label>
        <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
          Currently {tokenSet ? "configured" : "not set — the bridge is inactive"}. Create a bot at{" "}
          <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">
            discord.com/developers/applications
          </a>
          , enable the "Message Content" privileged intent, invite it to your server, and paste its token here.
        </p>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="password"
            placeholder={tokenSet ? "•••••••• (enter a new token to replace it)" : "Paste bot token"}
            value={newToken}
            onChange={(e) => setNewToken(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={saveToken} disabled={!newToken}>
            Save
          </button>
        </div>
        {saved && <span style={{ fontSize: "0.85rem", color: "var(--accent-audio)" }}>Saved ✓ — reconnecting…</span>}
      </div>

      <p style={{ fontSize: "0.85rem", color: "var(--text-dim)", marginTop: "1.5rem" }}>
        Connect individual topics to Discord channels from the Forum topics page — each topic's edit form has
        "Discord channel ID" and an optional "Discord webhook URL" field.
      </p>
    </div>
  );
}
