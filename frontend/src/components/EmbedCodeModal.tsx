import { useState } from "react";
import { useToastStore } from "../lib/toastStore";

interface Props {
  playlistSlug: string;
  onClose: () => void;
}

export function EmbedCodeModal({ playlistSlug, onClose }: Props) {
  const [view, setView] = useState<"map" | "venn">("map");
  const url = `${window.location.origin}/embed/playlist/${playlistSlug}${view === "venn" ? "#venn" : ""}`;
  const snippet = `<iframe src="${url}" width="800" height="600" style="border:0;" allow="autoplay" title="Exomusica playlist"></iframe>`;

  function copy() {
    navigator.clipboard.writeText(snippet);
    useToastStore.getState().showToast("Embed code copied ✓");
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1rem", maxWidth: 480, width: "90%" }}
      >
        <h3 style={{ marginTop: 0 }}>Embed this playlist</h3>
        <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
          Paste this into another page to embed a live, playable view of this playlist's spacemap or constellation.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.6rem" }}>
          <button className={`btn${view === "map" ? " btn-primary" : ""}`} onClick={() => setView("map")}>
            Spacemap
          </button>
          <button className={`btn${view === "venn" ? " btn-primary" : ""}`} onClick={() => setView("venn")}>
            Constellation
          </button>
        </div>
        <textarea readOnly value={snippet} rows={3} style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "0.78rem" }} onClick={(e) => (e.target as HTMLTextAreaElement).select()} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.6rem" }}>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary" onClick={copy}>
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}
