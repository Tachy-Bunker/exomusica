import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { paintStrip, rampFor, STRIP_H, STRIP_W, unpackPoints } from "../lib/specStrip";

interface WallTrack { id: number; title: string; seconds: number | null; album: string; albumTitle: string; branch: string }
interface WallPage { locked: boolean; total: number; tracks: WallTrack[] }
interface WallStrips { locked: boolean; strips: Record<string, string>; pending: number[] }

const POLL_MS = 8000, POLL_ROUNDS = 6;

/** A branch's colour from its name: the same branch is always the same hue. */
export function branchHex(name: string): string {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360, s = 0.7, l = 0.5, c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return "#" + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
}
const ramps = new Map<string, Uint8Array>();
const rampOf = (branch: string): Uint8Array => { let r = ramps.get(branch); if (!r) { r = rampFor(branchHex(branch)); ramps.set(branch, r); } return r; };

function Tile({ t, bytes }: { t: WallTrack; bytes: string | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!bytes || !ref.current) return;
    const bin = atob(bytes), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const levels = unpackPoints(u), ctx = ref.current.getContext("2d");
    if (levels && ctx) paintStrip(ctx, levels, rampOf(t.branch));
  }, [bytes, t.branch]);
  return (
    <li className="sw-tile" data-testid="wall-tile" data-drawn={bytes ? "1" : "0"}>
      <Link to={`/album/${t.album}`} className="sw-link" title={`${t.title} · ${t.albumTitle}`}>
        <canvas ref={ref} width={STRIP_W} height={STRIP_H} className="sw-canvas" aria-hidden="true" />
        <span className="sw-title">{t.title}</span>
        <span className="sw-sub home-dim">{t.branch}</span>
      </Link>
    </li>
  );
}

/** Every official track as its own spectrogram strip, coloured by its branch. Strips arrive as the server draws them, a couple at a time. */
export function SpectralWall() {
  const [tracks, setTracks] = useState<WallTrack[]>([]);
  const [total, setTotal] = useState(0);
  const [strips, setStrips] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const timer = useRef<number | null>(null);
  const rounds = useRef(0);
  const alive = useRef(true);

  const fetchStrips = useCallback(async (ids: number[]): Promise<number[]> => {
    if (!ids.length) return [];
    try {
      const r = await api<WallStrips>(`/api/spectral-wall/strips?ids=${ids.join(",")}`);
      if (!alive.current || r.locked) return [];
      if (Object.keys(r.strips).length) setStrips((s) => ({ ...s, ...r.strips }));
      return r.pending;
    } catch { return []; }
  }, []);

  const poll = useCallback((ids: number[]) => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!ids.length || rounds.current >= POLL_ROUNDS) return;
    timer.current = window.setTimeout(async () => {
      if (!alive.current || document.hidden) { rounds.current++; poll(ids); return; } // a hidden tab asks for nothing
      rounds.current++;
      poll(await fetchStrips(ids));
    }, POLL_MS);
  }, [fetchStrips]);

  const load = useCallback(async (offset: number) => {
    setLoading(true);
    try {
      const p = await api<WallPage>(`/api/spectral-wall?offset=${offset}`);
      if (!alive.current || p.locked) return;
      setTotal(p.total);
      setTracks((cur) => offset === 0 ? p.tracks : [...cur, ...p.tracks]);
      rounds.current = 0;
      poll(await fetchStrips(p.tracks.map((t) => t.id)));
    } catch { /* leave what is there */ } finally { if (alive.current) setLoading(false); }
  }, [fetchStrips, poll]);

  useEffect(() => {
    alive.current = true; void load(0);
    return () => { alive.current = false; if (timer.current) window.clearTimeout(timer.current); };
  }, [load]);

  return (
    <section className="sb-section sw-wall" aria-labelledby="sw-h" data-testid="spectral-wall">
      <div className="home-h2-row"><h2 id="sw-h" className="home-h2">Spectral wall <span className="home-dim sb-count">{total}</span></h2><span className="home-dim sb-sub">every track, drawn as its sound · colour = branch</span></div>
      <ul className="sw-grid">{tracks.map((t) => <Tile key={t.id} t={t} bytes={strips[t.id]} />)}</ul>
      {tracks.length < total && <button type="button" className="btn" onClick={() => void load(tracks.length)} disabled={loading} data-testid="wall-more">{loading ? "Loading…" : "Show more"}</button>}
      {!loading && tracks.length === 0 && <p className="home-dim">Nothing on the wall yet.</p>}
    </section>
  );
}
