import { useState } from "react";
import { Link } from "react-router-dom";
import { isPinned, mb, offlineSupported, pinAlbum, unpinAlbum } from "../lib/offlinePack";

/** Pin / unpin an album for offline listening. */
export function OfflineButton({ slug }: { slug: string }) {
  const [pinned, setPinned] = useState(() => isPinned(slug));
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [size, setSize] = useState(0);
  if (!offlineSupported()) return null;
  async function toggle() {
    setErr("");
    if (pinned) { await unpinAlbum(slug); setPinned(false); return; }
    setBusy(0);
    try { const a = await pinAlbum(slug, (f) => setBusy(f)); setPinned(true); setSize(a.bytes); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save it."); }
    setBusy(null);
  }
  return (
    <>
      <button className={`btn${pinned ? " btn-primary" : ""}`} onClick={toggle} disabled={busy !== null} data-testid="offline-toggle"
        title={pinned ? "Saved on this device: it plays without a connection. Click to remove." : "Keep this album on this device so it plays without a connection"}>
        {busy !== null ? `Saving… ${Math.round(busy * 100)}%` : pinned ? "Offline ✓" : "Save offline"}
      </button>
      {pinned && size > 0 && <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>{mb(size)}</span>}
      {pinned && <Link to="/offline" style={{ fontSize: "0.72rem" }}>manage</Link>}
      {err && <span role="alert" style={{ fontSize: "0.72rem", color: "var(--danger, #e66)" }}>{err}</span>}
    </>
  );
}
