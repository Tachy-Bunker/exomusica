import { useMemo, useState } from "react";
import { layoutGenreBlobs, blobBorderRadius, type GenreBlob } from "../lib/vennLayout";

const WIDTH = 320;
const HEIGHT = 220;

interface Props {
  /** {id, genres} for every track whose genre co-occurrence should shape
   *  this diagram's overlap - typically every other track in the same
   *  album, so blobs that frequently appear together on this album
   *  visually overlap here too. */
  contextTracks: { id: number; genres: string[] }[];
  /** The genres currently assigned to the track being edited - rendered
   *  in a lighter highlight color; everything else uses the site's
   *  primary color. */
  selectedGenres: string[];
  onToggleGenres: (genres: string[]) => void;
}

function normalizeBlobs(blobs: GenreBlob[]): GenreBlob[] {
  if (blobs.length === 0) return [];
  const maxExtent = Math.max(...blobs.map((b) => Math.hypot(b.x, b.y) + b.radius), 1);
  const scale = (Math.min(WIDTH, HEIGHT) / 2 - 12) / maxExtent;
  return blobs.map((b) => ({ ...b, x: b.x * scale, y: b.y * scale, radius: b.radius * scale }));
}

/** Which blobs contain a given point, by simple distance-to-center check
 *  against each blob's own radius - close enough for a small picker
 *  widget even though the actual rendered shape is a bit irregular. */
function blobsAtPoint(blobs: GenreBlob[], px: number, py: number): GenreBlob[] {
  return blobs.filter((b) => Math.hypot(px - (WIDTH / 2 + b.x), py - (HEIGHT / 2 + b.y)) <= b.radius);
}

export function VennGenrePicker({ contextTracks, selectedGenres, onToggleGenres }: Props) {
  const [hovered, setHovered] = useState<string[]>([]);

  const blobs = useMemo(() => normalizeBlobs(layoutGenreBlobs(contextTracks)), [contextTracks]);
  const selectedSet = useMemo(() => new Set(selectedGenres.map((g) => g.toLowerCase())), [selectedGenres]);

  if (blobs.length === 0) {
    return <p style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>No other genres on this album yet to pick from - type a new one in the box.</p>;
  }

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const hit = blobsAtPoint(blobs, e.clientX - rect.left, e.clientY - rect.top);
    setHovered(hit.map((b) => b.name));
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const hit = blobsAtPoint(blobs, e.clientX - rect.left, e.clientY - rect.top);
    if (hit.length > 0) onToggleGenres(hit.map((b) => b.name));
  }

  return (
    <div>
      <div
        onMouseMove={handleMove}
        onMouseLeave={() => setHovered([])}
        onClick={handleClick}
        style={{
          position: "relative",
          width: WIDTH,
          height: HEIGHT,
          background: "var(--bg-inset)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          cursor: "pointer",
          overflow: "hidden",
        }}
      >
        {blobs.map((b) => {
          const isSelected = selectedSet.has(b.name.toLowerCase());
          return (
            <div
              key={b.name}
              title={b.name}
              style={{
                position: "absolute",
                left: WIDTH / 2 + b.x,
                top: HEIGHT / 2 + b.y,
                transform: "translate(-50%, -50%)",
                width: b.radius * 2,
                height: b.radius * 2,
                borderRadius: blobBorderRadius(b),
                background: isSelected ? "hsla(30, 85%, 70%, 0.35)" : "hsla(15, 70%, 45%, 0.14)",
                border: isSelected ? "1px solid hsla(30, 85%, 75%, 0.8)" : "1px solid var(--accent-forum-dim)",
                pointerEvents: "none",
              }}
            />
          );
        })}
        {blobs.map((b) => {
          const isSelected = selectedSet.has(b.name.toLowerCase());
          return (
            <div
              key={`label-${b.name}`}
              style={{
                position: "absolute",
                left: WIDTH / 2 + b.x,
                top: HEIGHT / 2 + b.y - b.radius * 0.5,
                transform: "translate(-50%, -50%)",
                fontSize: "0.68rem",
                fontWeight: isSelected ? 700 : 500,
                color: isSelected ? "#ffe9c9" : "var(--accent-forum)",
                textShadow: "0 0 4px rgba(0,0,0,0.9)",
                pointerEvents: "none",
                whiteSpace: "nowrap",
              }}
            >
              {b.name}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "0.2rem", minHeight: "1.2em" }}>
        {hovered.length > 0 ? hovered.join(", ") : "Hover to preview, click to add/remove for this track"}
      </p>
    </div>
  );
}
