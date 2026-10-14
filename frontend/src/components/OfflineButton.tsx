import { useState } from "react";
import { Link } from "react-router-dom";
import { isPinned, isPlaylistPinned, mb, offlineSupported, pinAlbum, pinPlaylist, unpinAlbum, unpinPlaylist } from "../lib/offlinePack";

/** Pin / unpin an album (or, once the community unlocks it, a playlist) for offline listening. */
export function OfflineButton({ slug, kind = "album" }: { slug: string; kind?: "album" | "playlist" }) {
  const [pinned, setPinned] = useState(() => (kind === "playlist" ? isPlaylistPinned(slug) : isPinned(slug)));
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [size, setSize] = useState(0);
  if (!offlineSupported()) return null;
  async function toggle() {
    setErr("");
    if (pinned) { await (kind === "playlist" ? unpinPlaylist(slug) : unpinAlbum(slug)); setPinned(false); return; }
    setBusy(0);
    try { const a = await (kind === "playlist" ? pinPlaylist : pinAlbum)(slug, (f) => setBusy(f)); setPinned(true); setSize(a.bytes); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save it."); }
    setBusy(null);
  }
  return (
    <>
      <button className={`btn${pinned ? " btn-primary" : ""}`} onClick={toggle} disabled={busy !== null} data-testid="offline-toggle" data-kind={kind}
        title={pinned ? "Saved on this device: it plays without a connection. Click to remove." : `Keep this ${kind} on this device so it plays without a connection`}>
        {busy !== null ? `Saving… ${Math.round(busy * 100)}%` : pinned ? "Offline ✓" : "Save offline"}
      </button>
      {pinned && size > 0 && <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>{mb(size)}</span>}
      {pinned && <Link to="/offline" style={{ fontSize: "0.72rem" }}>manage</Link>}
      {err && <span role="alert" style={{ fontSize: "0.72rem", color: "var(--danger, #e66)" }}>{err}</span>}
    </>
  );
}
