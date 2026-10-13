import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAudioStore } from "../lib/audioStore";
import { listPinned, mb, offlineSupported, unpinAlbum, usage, type PinnedAlbum } from "../lib/offlinePack";
import { useDocumentTitle } from "../lib/useDocumentTitle";

export function OfflinePage() {
  useDocumentTitle("Offline");
  const [list, setList] = useState<PinnedAlbum[]>(listPinned);
  const [u, setU] = useState<{ used: number; quota: number } | null>(null);
  const play = useAudioStore((s) => s.play);
  const addToQueue = useAudioStore((s) => s.addToQueue);
  const clearQueue = useAudioStore((s) => s.clearQueue);
  const setCurrentPlaylist = useAudioStore((s) => s.setCurrentPlaylist);
  useEffect(() => { void usage().then(setU); }, [list]);
  return (
    <div className="page-column" style={{ maxWidth: 720 }}>
      <h1>Offline</h1>
      <p style={{ color: "var(--text-dim)" }}>Albums kept on this device. They play without a connection. Nothing is saved unless you press “Save offline” on an album.</p>
      {!offlineSupported() && <p>This browser can't keep files for offline use.</p>}
      {u && <p className="mono" style={{ fontSize: "0.8rem" }}>This site uses {mb(u.used)} of {mb(u.quota)} the browser allows.</p>}
      {list.length === 0 && <p>Nothing saved yet. Open an album and press “Save offline”.</p>}
      {list.map((a) => (
        <div key={a.slug} data-testid="offline-row" style={{ display: "flex", gap: "0.8rem", alignItems: "center", padding: "0.6rem 0", borderBottom: "1px solid var(--border)" }}>
          <div style={{ width: 56, height: 56, borderRadius: "var(--radius)", background: a.coverArtUrl ? `url(${a.coverArtUrl}) center/cover` : "var(--bg-elevated)", border: "1px solid var(--border)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Link to={`/album/${a.slug}`} style={{ fontWeight: 600 }}>{a.title}</Link>
            <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>{a.composer} · {a.tracks.length} tracks{a.bytes ? ` · ${mb(a.bytes)}` : ""}</div>
          </div>
          <button className="btn btn-primary" onClick={() => { const [first, ...rest] = a.tracks; if (!first) return; play(first); clearQueue(); addToQueue(rest); setCurrentPlaylist(null); }}>Play</button>
          <button className="btn btn-danger" onClick={async () => { await unpinAlbum(a.slug); setList(listPinned()); }}>Remove</button>
        </div>
      ))}
    </div>
  );
}
