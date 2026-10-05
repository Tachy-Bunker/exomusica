import { create } from "zustand";
import { useAudioStore } from "./audioStore";
import { useToastStore } from "./toastStore";

// One shared <audio> for every clip on the page: starting a clip stops the
// previous one, pauses the site's music player, and stops precisely at the
// clip's end (the browser's timeupdate event is far too coarse for that).

export interface ClipRef {
  url: string;
  start: number;
  end: number;
}

export const useClipPlayer = create<{ playing: ClipRef | null }>(() => ({ playing: null }));

let audio: HTMLAudioElement | null = null;
let raf = 0;
const positionListeners = new Set<(url: string, t: number) => void>();

/** Playhead updates for waveform displays - kept out of React state so they cost no re-renders. */
export function onClipPosition(fn: (url: string, t: number) => void): () => void {
  positionListeners.add(fn);
  return () => positionListeners.delete(fn);
}

export const sameClip = (a: ClipRef | null, b: ClipRef) => !!a && a.url === b.url && a.start === b.start && a.end === b.end;

function pauseOtherMedia() {
  const music = useAudioStore.getState();
  if (music.isPlaying) music.toggle();
  document.querySelectorAll<HTMLAudioElement>("audio[data-evidence]").forEach((el) => el.pause());
}

function tick() {
  const playing = useClipPlayer.getState().playing;
  if (!playing || !audio) return;
  positionListeners.forEach((fn) => fn(playing.url, audio!.currentTime));
  if (audio.currentTime >= playing.end - 0.01 || audio.ended) {
    stopClip();
    return;
  }
  raf = requestAnimationFrame(tick);
}

export function stopClip(): void {
  cancelAnimationFrame(raf);
  audio?.pause();
  const was = useClipPlayer.getState().playing;
  useClipPlayer.setState({ playing: null });
  if (was) positionListeners.forEach((fn) => fn(was.url, -1)); // -1 = hide the playhead
}

export function playClip(clip: ClipRef): void {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
  }
  const a = audio;
  pauseOtherMedia();
  cancelAnimationFrame(raf);
  const begin = () => {
    a.currentTime = clip.start;
    // Some servers can't seek until enough has loaded (no Range support), and a seek made too early silently
    // doesn't stick. Keep retrying briefly; if it never does, stop rather than play the WRONG part of the recording.
    let tries = 0;
    const seekTimer = window.setInterval(() => {
      const stillThisClip = sameClip(useClipPlayer.getState().playing, clip);
      if (!stillThisClip || a.currentTime >= clip.start - 0.3) return window.clearInterval(seekTimer);
      if (++tries > 30) {
        window.clearInterval(seekTimer);
        stopClip();
        useToastStore.getState().showToast("This audio host doesn't allow jumping into the middle of the file, so the clip can't be played here");
        return;
      }
      a.currentTime = clip.start;
    }, 100);
    void a.play().catch(() => stopClip());
    useClipPlayer.setState({ playing: clip });
    tick();
  };
  const wanted = new URL(clip.url, window.location.href).href;
  if (a.src === wanted && a.readyState >= 1) {
    begin();
  } else {
    a.addEventListener("loadedmetadata", begin, { once: true });
    a.src = clip.url;
    a.load();
  }
}

// If the site's music starts, a clip gives way to it.
useAudioStore.subscribe((state, prev) => {
  if (state.isPlaying && !prev.isPlaying && useClipPlayer.getState().playing) stopClip();
});
