import { useEffect, useRef, useState, type MouseEvent, type FocusEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useAudioStore } from "../lib/audioStore";
import type { Branch, BranchAlbum, MessageDTO } from "../lib/types";
import { layoutTree, type LaidOutBranch } from "../lib/treeLayout";

const WIDTH = 900;
const HEIGHT = 640;
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };

interface HoverPos {
  x: number;
  y: number;
}

function BranchHoverCard({ branch, pos, wrapHeight }: { branch: Branch; pos: HoverPos; wrapHeight: number }) {
  const [messages, setMessages] = useState<MessageDTO[] | null>(null);
  const [albums, setAlbums] = useState<BranchAlbum[] | null>(null);
  const play = useAudioStore((s) => s.play);

  useEffect(() => {
    let cancelled = false;
    setMessages(null);
    setAlbums(null);
    if (branch.channel) {
      api<MessageDTO[]>(`/api/channels/${branch.channel.slug}/messages?limit=3`).then((m) => {
        if (!cancelled) setMessages(m);
      });
    }
    api<BranchAlbum[]>(`/api/branches/${branch.slug}/albums`).then((a) => {
      if (!cancelled) setAlbums(a);
    });
    return () => {
      cancelled = true;
    };
  }, [branch.slug, branch.channel]);

  // Flip the card above the node once we're past the halfway point of the
  // *actual rendered* wrapper, so it doesn't run off the bottom edge.
  const flipUp = pos.y > wrapHeight / 2;

  return (
    <div className="tree-hover-card" style={{ left: pos.x + 16, top: flipUp ? pos.y - 260 : pos.y + 16 }}>
      <h3 style={{ fontSize: "1rem", marginBottom: "0.3rem" }}>{branch.name}</h3>
      {branch.description && <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>{branch.description}</p>}

      {branch.channel && (
        <div className="half forum">
          <div className="half-label">Forum</div>
          {messages === null && <p style={{ fontSize: "0.8rem" }}>Loading…</p>}
          {messages?.length === 0 && <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Quiet so far.</p>}
          {messages?.slice(-2).map((m) => (
            <p key={m.id} style={{ fontSize: "0.8rem", margin: "0.2rem 0" }}>
              <strong>{m.authorUsername}:</strong> {m.contentRaw.slice(0, 60)}
            </p>
          ))}
          <Link to={`/branch/${branch.slug}`} style={{ fontSize: "0.8rem" }}>
            Open topic →
          </Link>
        </div>
      )}

      <div className="half music">
        <div className="half-label">Music</div>
        {albums === null && <p style={{ fontSize: "0.8rem" }}>Loading…</p>}
        {albums?.length === 0 && <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>No releases yet.</p>}
        {albums?.slice(0, 2).map((a) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "0.3rem 0" }}>
            <span style={{ fontSize: "0.8rem", flex: 1 }}>
              {a.title} <span style={{ color: "var(--text-dim)" }}>— {a.composer}</span>
            </span>
            {a.previewTrack && (
              <button
                className="btn"
                style={{ pointerEvents: "auto", padding: "0.15rem 0.5rem", fontSize: "0.75rem" }}
                onClick={() => a.previewTrack && play(a.previewTrack)}
              >
                ▶
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function HomePage() {
  useDocumentTitle("");
  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<HoverPos | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<Branch[]>("/api/branches").then(setBranches);
  }, []);

  const laidOut = layoutTree(branches, CENTER.x, CENTER.y, 70, 140);
  const hovered = laidOut.find((b) => b.id === hoveredId) ?? null;

  // Measures the node's actual on-screen position, not its SVG viewBox
  // coordinates — the <svg> scales responsively to its container, so the
  // two only match by coincidence. This is what keeps the hover card
  // anchored to the node at any screen size.
  function activate(e: MouseEvent<SVGGElement> | FocusEvent<SVGGElement>, b: LaidOutBranch) {
    const wrapRect = wrapRef.current?.getBoundingClientRect();
    const nodeRect = e.currentTarget.getBoundingClientRect();
    if (!wrapRect) return;
    setHoveredId(b.id);
    setHoverPos({
      x: nodeRect.left - wrapRect.left + nodeRect.width / 2,
      y: nodeRect.top - wrapRect.top + nodeRect.height / 2,
    });
  }

  return (
    <div>
      <p style={{ maxWidth: 560, color: "var(--text-dim)" }}>
        Hover a branch to preview its topic and releases. Tap on mobile.
      </p>

      <div className="tree-wrap" ref={wrapRef}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
          {laidOut.map((b) => (
            <path
              key={`path-${b.id}`}
              className="tree-branch-path"
              d={`M ${CENTER.x} ${CENTER.y} Q ${(CENTER.x + b.x) / 2} ${b.y} ${b.x} ${b.y}`}
            />
          ))}
          <circle className="tree-core" cx={CENTER.x} cy={CENTER.y} r={40} />
          {laidOut.map((b) => (
            <g
              key={b.id}
              className="tree-node"
              transform={`translate(${b.x}, ${b.y})`}
              tabIndex={0}
              onMouseEnter={(e) => activate(e, b)}
              onMouseLeave={() => setHoveredId((id) => (id === b.id ? null : id))}
              onFocus={(e) => activate(e, b)}
              onClick={() => navigate(`/branch/${b.slug}`)}
              style={{ cursor: "pointer" }}
            >
              <circle r={7} />
              <text y={22} textAnchor="middle">
                {b.name}
              </text>
            </g>
          ))}
        </svg>

        <Link
          to="/join"
          className="btn btn-primary"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textDecoration: "none",
          }}
        >
          Join
        </Link>

        {hovered && hoverPos && (
          <BranchHoverCard branch={hovered} pos={hoverPos} wrapHeight={wrapRef.current?.clientHeight ?? HEIGHT} />
        )}
      </div>
    </div>
  );
}
