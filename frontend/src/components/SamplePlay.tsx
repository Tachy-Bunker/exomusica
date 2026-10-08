import { useState } from "react";
import { api } from "../lib/api";
import { PauseIcon, PlayIcon } from "./Icons";
import { useAudioStore } from "../lib/audioStore";
import type { PlayableTrackDTO } from "../lib/types";
import type { ContributeSample } from "../lib/contribute";

/** A stable negative id for a chat file, so it can never be mistaken for a track of an album. */
export function fileId(url: string): number {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (Math.imul(h, 31) + url.charCodeAt(i)) | 0;
  return -(Math.abs(h) + 1);
}

/** The branch's sample: one Play button (no browser player). A track of the site plays as itself; a chat file plays with a link back to its message. */
export function SamplePlay({ sample, branchSlug }: { sample: ContributeSample; branchSlug: string }) {
  const cur = useAudioStore((s) => s.currentTrack);
  const playing = useAudioStore((s) => s.isPlaying);
  const play = useAudioStore((s) => s.play);
  const toggle = useAudioStore((s) => s.toggle);
  const clearQueue = useAudioStore((s) => s.clearQueue);
  const setCurrentPlaylist = useAudioStore((s) => s.setCurrentPlaylist);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const on = !!cur && (sample.kind === "track" ? cur.id === sample.trackId && cur.source === sample.source : cur.fileUrl === sample.url);

  async function press() {
    if (on) { toggle(); return; }
    setBusy(true); setFailed(false);
    try {
      let track: PlayableTrackDTO | undefined;
      if (sample.kind === "track") {
        const path = sample.source === "community" ? `/api/community-albums/${encodeURIComponent(sample.albumSlug)}` : `/api/albums/${encodeURIComponent(sample.albumSlug)}`;
        const album = await api<{ tracks: PlayableTrackDTO[] }>(path);
        track = album.tracks.find((t) => t.id === sample.trackId);
      } else {
        track = {
          id: fileId(sample.url), title: sample.title, fileUrl: sample.url, format: "MP3", durationSeconds: null, position: 0,
          albumTitle: "", albumSlug: "", coverArtUrl: null, composer: "", branchSlug, bookmarks: [], replayGainDb: null, source: "official", genres: [], origin: sample.origin,
        };
      }
      if (!track) { setFailed(true); return; }
      clearQueue(); setCurrentPlaylist(null); play(track);
    } catch { setFailed(true); } finally { setBusy(false); }
  }
  const label = sample.kind === "track" ? sample.title : sample.title;
  const sub = sample.kind === "track" ? sample.detail : sample.origin ? `from ${sample.origin.label}` : "";
  return (
    <button type="button" className="ct2-play" onClick={press} disabled={busy} aria-label={on && playing ? `Pause ${label}` : `Play ${label}`} data-testid="sample-play">
      <span className="ct2-play-icon">{on && playing ? <PauseIcon size={15} /> : <PlayIcon size={15} />}</span>
      <span className="ct2-play-text"><b>{failed ? "Couldn't play it" : label}</b>{sub && <small>{sub}</small>}</span>
    </button>
  );
}
