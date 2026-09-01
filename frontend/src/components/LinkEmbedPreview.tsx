import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface LinkPreviewData {
  url: string;
  title: string;
  description: string | null;
  image: string | null;
}

export function LinkEmbedPreview({ url, onClose }: { url: string; onClose: () => void }) {
  const [data, setData] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    api<LinkPreviewData>(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [url]);

  return (
    <div
      style={{
        display: "flex",
        gap: "0.6rem",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "0.5rem",
        marginBottom: "0.6rem",
        flexShrink: 0,
      }}
    >
      {loading && <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", margin: 0 }}>Loading preview…</p>}
      {!loading && data && (
        <>
          {data.image && (
            <img src={data.image} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: "var(--radius)", flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <a href={data.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600, fontSize: "0.85rem" }}>
              {data.title}
            </a>
            {data.description && (
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-dim)",
                  margin: "0.2rem 0 0",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {data.description}
              </p>
            )}
          </div>
        </>
      )}
      <button className="btn" style={{ padding: "0 0.4rem", alignSelf: "flex-start" }} onClick={onClose}>
        ×
      </button>
    </div>
  );
}
