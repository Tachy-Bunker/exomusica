import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";

export function JoinPage() {
  const [form, setForm] = useState({ username: "", email: "", password: "", bio: "", reason: "" });
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/join", { method: "POST", body: JSON.stringify(form) });
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  if (status === "sent") {
    return (
      <div style={{ maxWidth: 480, margin: "3rem auto" }}>
        <h1>Request sent</h1>
        <p>Your application is waiting on approval. You'll be able to log in once it's reviewed.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: "2rem auto" }}>
      <h1>Join Exomusica</h1>
      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>
        Are you an enthusiast, musician, developer, or researcher?
        <br />
        You can apply to come in, chat and connect with the other members.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            required
            pattern="[a-zA-Z0-9_.\-]{3,32}"
            title="3-32 characters: letters, numbers, underscore, hyphen, or period — no spaces"
            value={form.username}
            onChange={(e) => update("username", e.target.value)}
          />
          <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
            Letters, numbers, underscore, hyphen, or period only — no spaces.
          </span>
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="bio">Bio</label>
          <textarea id="bio" rows={2} value={form.bio} onChange={(e) => update("bio", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="reason">Why do you want to join?</label>
          <textarea
            id="reason"
            rows={3}
            required
            value={form.reason}
            onChange={(e) => update("reason", e.target.value)}
          />
        </div>
        {error && <p style={{ color: "var(--accent-danger)" }}>{error}</p>}
        <button className="btn btn-primary" type="submit">
          Submit
        </button>
      </form>
    </div>
  );
}
