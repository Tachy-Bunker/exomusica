import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { useToastStore } from "../../lib/toastStore";

interface TrackRow {
  id: number;
  kind: "official" | "community";
  title: string;
  composer: string;
  albumTitle: string;
  albumSlug: string;
  branchName: string | null;
  owner: string | null;
  genres: string[];
  lyrics: string | null;
  fileUrl: string | null;
  format: string;
  durationSeconds: number | null;
  position: number;
}

function rowKey(r: TrackRow) {
  return `${r.kind}:${r.id}`;
}

function toCsvValue(v: string | number | null): string {
  const s = v === null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(rows: TrackRow[], filename: string) {
  const headers = ["kind", "id", "title", "composer", "albumTitle", "branchName", "owner", "genres", "lyrics", "format", "durationSeconds"];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [r.kind, r.id, r.title, r.composer, r.albumTitle, r.branchName ?? "", r.owner ?? "", r.genres.join("; "), r.lyrics ?? "", r.format, r.durationSeconds ?? ""]
        .map(toCsvValue)
        .join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AllTracksAdminPage() {
  useDocumentTitle("All Tracks");
  const [rows, setRows] = useState<TrackRow[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editDrafts, setEditDrafts] = useState<Record<string, { title: string; composer: string; genres: string; lyrics: string }>>({});

  function load() {
    api<TrackRow[]>("/api/admin/all-tracks").then((data) => {
      setRows(data);
      const drafts: typeof editDrafts = {};
      for (const r of data) drafts[rowKey(r)] = { title: r.title, composer: r.composer, genres: r.genres.join(", "), lyrics: r.lyrics ?? "" };
      setEditDrafts(drafts);
    });
  }
  useEffect(load, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.albumTitle.toLowerCase().includes(q) ||
        r.composer.toLowerCase().includes(q) ||
        r.genres.some((g) => g.toLowerCase().includes(q)) ||
        (r.owner ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  function toggleSelected(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function saveRow(r: TrackRow) {
    const draft = editDrafts[rowKey(r)];
    if (!draft) return;
    const genres = draft.genres.split(",").map((g) => g.trim()).filter(Boolean);
    if (r.kind === "official") {
      await api(`/api/admin/tracks/${r.id}`, { method: "PATCH", body: JSON.stringify({ title: draft.title, genres }) });
    } else {
      await api(`/api/community-tracks/${r.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: draft.title, composer: draft.composer || null, genres, lyrics: draft.lyrics || null }),
      });
    }
    useToastStore.getState().showToast("Saved ✓");
    load();
  }

  return (
    <div>
      <h1>All Tracks</h1>
      <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
        Every track across official albums and community albums, in one place. Edits save to whichever table the
        track actually belongs to.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", margin: "0.8rem 0" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, album, composer, genre, owner..."
          style={{ flex: 1, maxWidth: 400 }}
        />
        <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
          {filtered.length} track{filtered.length !== 1 ? "s" : ""} · {selected.size} selected
        </span>
        <button className="btn" onClick={() => downloadCsv(filtered, "exomusica-tracks.csv")}>
          Export CSV (filtered)
        </button>
        <button className="btn" disabled={selected.size === 0} onClick={() => downloadCsv(rows.filter((r) => selected.has(rowKey(r))), "exomusica-tracks-selected.csv")}>
          Export CSV (selected)
        </button>
      </div>

      <table style={{ width: "100%", fontSize: "0.82rem", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th />
            <th style={{ textAlign: "left" }}>Kind</th>
            <th style={{ textAlign: "left" }}>Title</th>
            <th style={{ textAlign: "left" }}>Composer</th>
            <th style={{ textAlign: "left" }}>Album</th>
            <th style={{ textAlign: "left" }}>Owner/Branch</th>
            <th style={{ textAlign: "left" }}>Genres</th>
            <th style={{ textAlign: "left" }}>Lyrics/notes</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => {
            const key = rowKey(r);
            const draft = editDrafts[key] ?? { title: r.title, composer: r.composer, genres: r.genres.join(", "), lyrics: r.lyrics ?? "" };
            return (
              <tr key={key} style={{ borderTop: "1px solid var(--border)" }}>
                <td>
                  <input type="checkbox" checked={selected.has(key)} onChange={() => toggleSelected(key)} />
                </td>
                <td>{r.kind === "official" ? "official" : "community"}</td>
                <td>
                  <input
                    value={draft.title}
                    onChange={(e) => setEditDrafts((d) => ({ ...d, [key]: { ...draft, title: e.target.value } }))}
                    style={{ width: 140, fontSize: "0.8rem" }}
                  />
                </td>
                <td>
                  <input
                    value={draft.composer}
                    disabled={r.kind === "official"}
                    onChange={(e) => setEditDrafts((d) => ({ ...d, [key]: { ...draft, composer: e.target.value } }))}
                    style={{ width: 110, fontSize: "0.8rem" }}
                    title={r.kind === "official" ? "Edit composer credits via the album's collaborator list" : undefined}
                  />
                </td>
                <td style={{ fontSize: "0.78rem" }}>{r.albumTitle}</td>
                <td style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>{r.owner ?? r.branchName ?? ""}</td>
                <td>
                  <input
                    value={draft.genres}
                    onChange={(e) => setEditDrafts((d) => ({ ...d, [key]: { ...draft, genres: e.target.value } }))}
                    placeholder="comma, separated"
                    style={{ width: 180, fontSize: "0.8rem" }}
                  />
                </td>
                <td>
                  <input
                    value={draft.lyrics}
                    disabled={r.kind === "official"}
                    onChange={(e) => setEditDrafts((d) => ({ ...d, [key]: { ...draft, lyrics: e.target.value } }))}
                    style={{ width: 160, fontSize: "0.8rem" }}
                  />
                </td>
                <td>
                  <button className="btn btn-primary" style={{ fontSize: "0.75rem" }} onClick={() => saveRow(r)}>
                    save
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
