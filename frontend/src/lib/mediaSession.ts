// Tells the browser and the operating system what is playing (title, artist, album, artwork) and lets lock-screen, headset,
// keyboard media keys and the notification shade control it. It reads the audio store and writes nothing back except through the
// store's own actions, so it costs nothing while nothing plays. No timer: the browser extrapolates the position by itself, so the
// position is only re-sent when the track, the length, play/pause, or a jump in time changes.
import { useAudioStore } from "./audioStore";
import type { PlayableTrackDTO } from "./types";

const SIZES = ["96x96", "192x192", "512x512"];

function absolute(url: string): string {
  try { return new URL(url, window.location.origin).href; } catch { return url; }
}
function mimeOf(url: string): string | undefined {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : undefined;
}

/** What the system shows for a track. Pure so it can be tested. */
export function metadataFor(t: PlayableTrackDTO & { origin?: { label: string } | null }): { title: string; artist: string; album: string; artwork: { src: string; sizes: string; type?: string }[] } {
  const cover = t.coverArtUrl ? absolute(t.coverArtUrl) : null;
  return {
    title: t.title,
    artist: t.composer || "",
    album: t.albumTitle || t.origin?.label || "Exomusica",
    artwork: cover ? SIZES.map((sizes) => ({ src: cover, sizes, type: mimeOf(cover) })) : [],
  };
}

let started = false;
export function startMediaSession(): void {
  if (started || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  started = true;
  const ms = navigator.mediaSession;
  const st = () => useAudioStore.getState();
  const safe = (action: MediaSessionAction, fn: MediaSessionActionHandler) => { try { ms.setActionHandler(action, fn); } catch { /* an action this browser doesn't know */ } };

  safe("play", () => { if (!st().isPlaying) st().toggle(); });
  safe("pause", () => { if (st().isPlaying) st().toggle(); });
  safe("previoustrack", () => st().playPrevious());
  safe("nexttrack", () => st().playNext());
  safe("seekto", (d) => { if (typeof d.seekTime === "number") st().seek(d.seekTime); });
  safe("seekbackward", (d) => st().seekBy(-(d.seekOffset ?? 10)));
  safe("seekforward", (d) => st().seekBy(d.seekOffset ?? 10));

  let lastTrackId: string | null = null;
  let expected = 0; // where the position should be if time just ran on, to notice seeks
  let lastSent = 0;
  const sendPosition = (force: boolean) => {
    const s = st();
    if (!s.currentTrack || !(s.duration > 0) || !ms.setPositionState) return;
    const now = performance.now();
    if (!force && now - lastSent < 400) return;
    lastSent = now;
    try { ms.setPositionState({ duration: s.duration, position: Math.min(s.currentTime, s.duration), playbackRate: 1 }); } catch { /* duration not finite yet */ }
  };

  useAudioStore.subscribe((s, prev) => {
    const t = s.currentTrack;
    const id = t ? `${t.source}:${t.id}` : null;
    if (id !== lastTrackId) {
      lastTrackId = id;
      ms.metadata = t ? new MediaMetadata(metadataFor(t)) : null;
      expected = 0;
    }
    if (!t) { ms.playbackState = "none"; return; }
    if (s.isPlaying !== prev.isPlaying) { ms.playbackState = s.isPlaying ? "playing" : "paused"; sendPosition(true); return; }
    if (s.duration !== prev.duration) { sendPosition(true); return; }
    if (s.currentTime !== prev.currentTime) {
      const jumped = Math.abs(s.currentTime - expected) > 1.5;
      expected = s.currentTime + 0.25; // timeupdate arrives about four times a second
      if (jumped) sendPosition(true);
    }
  });
}
