import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";

interface ChannelSummary {
  slug: string;
  name: string;
}

export function ChannelsPage() {
  const [topics, setTopics] = useState<ChannelSummary[]>([]);
  const [form, setForm] = useState({ slug: "", name: "" });
  const [error, setError] = useState<string | null>(null);

  function load() {
    api<ChannelSummary[]>("/api/channels?kind=DISCUSSION").then(setTopics);
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/admin/channels", { method: "POST", body: JSON.stringify(form) });
      setForm({ slug: "", name: "" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <div>
      <h1>Discussion topics</h1>

      <form onSubmit={handleSubmit} style={{ maxWidth: 380, marginBottom: "2rem" }}>
        <div className="field">
          <label htmlFor="slug">Slug</label>
          <input
            id="slug"
            required
            placeholder="art-you-like"
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            required
            placeholder="Art You Like"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        {error && <p style={{ color: "var(--accent-danger)" }}>{error}</p>}
        <button className="btn btn-primary" type="submit">
          Create topic
        </button>
      </form>

      <ul style={{ listStyle: "none", padding: 0 }}>
        {topics.map((t) => (
          <li key={t.slug} style={{ marginBottom: "0.4rem" }}>
            <Link to={`/topic/${t.slug}`}>{t.name}</Link>{" "}
            <span className="mono" style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>
              /{t.slug}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
