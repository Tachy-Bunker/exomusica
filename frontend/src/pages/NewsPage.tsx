import { useEffect, useState, type FormEvent } from "react";
import { useParams, Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { renderMarkdown } from "../lib/markdown";
import { useCustomFont, type FontInfo } from "../lib/useCustomFont";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useContentScaleStore } from "../lib/contentScaleStore";

interface PostSummary {
  id: number;
  slug: string;
  title: string;
  coverImageUrl: string | null;
  publishedAt: string;
}

interface PostFull extends PostSummary {
  contentMarkdown: string;
  font: FontInfo | null;
}

function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/newsletter/subscribe", { method: "POST", body: JSON.stringify({ email }) });
      setStatus("sent");
    } catch (err) {
      setStatus("error");
    }
  }

  if (status === "sent") return <p style={{ color: "var(--text-dim)" }}>Subscribed — you're on the list.</p>;

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: "0.5rem", maxWidth: 360 }}>
      <input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="btn btn-primary" type="submit">
        Subscribe
      </button>
      {status === "error" && <span style={{ color: "var(--accent-danger)" }}>Couldn't subscribe.</span>}
    </form>
  );
}

export function NewsPage() {
  const { slug } = useParams<{ slug?: string }>();
  const isDesktop = useIsDesktop();
  const scale = useContentScaleStore((s) => (isDesktop ? s.desktop : s.mobile));
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [current, setCurrent] = useState<PostFull | null>(null);
  const fontFamily = useCustomFont(current?.font);

  useEffect(() => {
    api<PostSummary[]>("/api/blog").then(setPosts);
  }, []);

  useEffect(() => {
    if (!slug) {
      setCurrent(null);
      return;
    }
    api<PostFull>(`/api/blog/${slug}`).then(setCurrent);
  }, [slug]);

  if (slug) {
    return (
      <div style={{ maxWidth: 640, fontFamily, fontSize: `${scale}rem` }}>
        <Link to="/news" style={{ fontSize: `${0.85 * scale}rem` }}>
          ← News
        </Link>
        {!current && <p>Loading…</p>}
        {current && (
          <>
            <h1>{current.title}</h1>
            <p className="mono" style={{ fontSize: `${0.8 * scale}rem`, color: "var(--text-dim)" }}>
              {new Date(current.publishedAt).toLocaleDateString()}
            </p>
            {renderMarkdown(current.contentMarkdown)}
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ fontSize: `${scale}rem` }}>
      <h1>News</h1>
      <NewsletterForm />
      <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 640 }}>
        {posts.length === 0 && <p style={{ color: "var(--text-dim)" }}>Nothing published yet.</p>}
        {posts.map((p) => (
          <Link key={p.id} to={`/news/${p.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
            <h2 style={{ fontSize: `${1.1 * scale}rem`, marginBottom: "0.1rem" }}>{p.title}</h2>
            <p className="mono" style={{ fontSize: `${0.8 * scale}rem`, color: "var(--text-dim)" }}>
              {new Date(p.publishedAt).toLocaleDateString()}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
