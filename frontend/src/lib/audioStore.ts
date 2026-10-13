import { create } from "zustand";
import type { PlayableTrackDTO } from "./types";
import { useAmbienceStore } from "./ambienceStore";
import { resumeAnalyserContextIfNeeded, setReplayGainDb, setActiveForAnalyser, rampFade, setFade } from "./audioAnalyser";
import { NO_TRANSITION, appliesTo, leadSeconds, markRange, nextBoundary, flipPosition, type AbRange, type AbSlot, type Transition } from "./playTransition";
import { analyzeAndSubmitReplayGain } from "./replayGain";

type RepeatMode = "off" | "all" | "one";

/** One side of the A/B pair: a stretch of one track. */
export type AbEntry = AbRange & { track: PlayableTrackDTO };
export interface AbState { A: AbEntry | null; B: AbEntry | null; active: AbSlot | null }

interface AudioState {
  currentTrack: PlayableTrackDTO | null;
  queue: PlayableTrackDTO[]; // upcoming tracks, in play order
  history: PlayableTrackDTO[]; // played stack, most recent last - powers "previous"
  shuffle: boolean;
  repeatMode: RepeatMode;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  expanded: boolean;
  currentPlaylist: { slug: string; title: string } | null; // which playlist the currently playing track was launched from, if any
  ab: AbState;
  /** Marks the start or end of a slot at the current moment of the current track. */
  abMark: (slot: AbSlot, edge: "start" | "end") => void;
  abClear: (slot: AbSlot) => void;
  /** Plays one side of the pair (looping its stretch). */
  abPlay: (slot: AbSlot) => void;
  /** One key: jump to the other side, the same distance into it. */
  abFlip: () => void;
  abStop: () => void;

  play: (track: PlayableTrackDTO) => void;
  /** Play a track starting `startAt` seconds in (for links that name a moment). */
  playAt: (track: PlayableTrackDTO, startAt: number | null) => void;
  playQueueIndex: (index: number) => void;
  setCurrentPlaylist: (playlist: { slug: string; title: string } | null) => void;
  addToQueue: (tracks: PlayableTrackDTO[]) => void;
  clearQueue: () => void;
  playNext: () => void;
  playPrevious: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
  toggle: () => void;
  seek: (time: number) => void;
  seekBy: (deltaSeconds: number) => void;
  setExpanded: (expanded: boolean) => void;
  setProgress: (currentTime: number, duration: number) => void;
  ended: () => void;
}

// The player owns two <audio> elements so one track can start while the last one is still fading out.
// `audioEl` always points at the audible one.
const els: (HTMLAudioElement | null)[] = [null, null];
let active = 0;
let audioEl: HTMLAudioElement | null = null;
export function bindAudioElement(el: HTMLAudioElement | null, slot: 0 | 1 = 0): void {
  els[slot] = el;
  if (el) el.volume = musicVolume;
  audioEl = els[active];
}
/** Events from the element that is not audible are ignored. */
export function isActiveEl(el: HTMLAudioElement): boolean {
  return els[active] === el;
}

let musicVolume = 1;
export function setMusicVolume(v: number): void {
  musicVolume = v;
  for (const e of els) if (e) e.volume = v;
}

export function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}


// ---- Track-to-track transitions and the A/B pair -------------------------------------------------
// One timer aims at the next moment that matters (the end of the A/B stretch, or the point where the next track
// must start). It is re-aimed on every time update, so seeks and pauses never leave it stale. Where a transition
// can't run (other album, nothing queued, no audio graph), the plain "ended" path still advances the queue.
const transCache = new Map<string, Transition>();
const transAsked = new Set<string>();
let boundaryTimer: ReturnType<typeof setTimeout> | undefined;
let finishTimer: ReturnType<typeof setTimeout> | undefined;
let xfading = false;
let preloadKey: string | null = null;
let abInternal = false;
const keyOf = (t: { id: number; source: string }) => `${t.source}:${t.id}`;
const otherEl = () => els[1 - active];

function loadTransition(albumSlug: string): void {
  if (!albumSlug || transAsked.has(albumSlug)) return;
  transAsked.add(albumSlug);
  fetch(`/api/albums/${encodeURIComponent(albumSlug)}/transition`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { mode?: string; ms?: number } | null) => {
      const mode = j?.mode === "gapless" || j?.mode === "crossfade" ? j.mode : "none";
      transCache.set(albumSlug, { mode, ms: Number(j?.ms) || 3000 });
      arm();
    })
    .catch(() => { transAsked.delete(albumSlug); });
}

function cancelTransition(): void {
  clearTimeout(boundaryTimer);
  clearTimeout(finishTimer);
  if (xfading) {
    const o = otherEl();
    if (o) { o.pause(); o.removeAttribute("src"); o.load(); setFade(o, 1); }
    if (audioEl) setFade(audioEl, 1);
    xfading = false;
  }
}

function abEnd(s: { currentTrack: PlayableTrackDTO | null; ab: AbState }): number | null {
  const slot = s.ab.active;
  const e = slot ? s.ab[slot] : null;
  return e && s.currentTrack && keyOf(e.track) === keyOf(s.currentTrack) ? e.end : null;
}

function arm(): void {
  clearTimeout(boundaryTimer);
  const el = audioEl;
  const s = useAudioStore.getState();
  if (!el || !s.currentTrack || !s.isPlaying || xfading) return;
  const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : s.currentTrack.durationSeconds || 0;
  const t = transCache.get(s.currentTrack.albumSlug) ?? NO_TRANSITION;
  const next = s.queue[0];
  const canJoin = s.repeatMode !== "one" && s.ab.active === null && appliesTo(s.currentTrack, next, t);
  const lead = canJoin ? leadSeconds(t, dur) : null;
  if (canJoin && next && dur - el.currentTime < 25) preload(next);
  const rangeEnd = abEnd(s);
  const at = nextBoundary({ duration: dur, currentTime: el.currentTime, rangeEnd, lead });
  if (at == null) return;
  boundaryTimer = setTimeout(() => boundary(at, rangeEnd, t), Math.max(0, (at - el.currentTime) * 1000 - 20));
}

function preload(next: PlayableTrackDTO): void {
  const o = otherEl();
  if (!o || preloadKey === keyOf(next)) return;
  preloadKey = keyOf(next);
  o.preload = "auto";
  o.src = next.fileUrl;
  o.load();
}

function boundary(at: number, rangeEnd: number | null, t: Transition): void {
  const el = audioEl;
  if (!el) return;
  if (el.currentTime < at - 0.04) { arm(); return; } // fired early: aim again
  if (rangeEnd != null && Math.abs(at - rangeEnd) < 1e-6) {
    const s = useAudioStore.getState();
    const e = s.ab.active ? s.ab[s.ab.active] : null;
    if (e) useAudioStore.getState().seek(e.start);
    arm();
    return;
  }
  startTransition(t);
}

function startTransition(t: Transition): void {
  const s = useAudioStore.getState();
  const next = s.queue[0];
  const from = audioEl;
  const to = otherEl();
  if (!next || !from || !to || xfading) return;
  const secs = t.mode === "gapless" ? leadSeconds(t, 0) + 0.01 : leadSeconds(t, from.duration || s.currentTrack?.durationSeconds || 60);
  xfading = true;
  if (preloadKey !== keyOf(next)) { to.src = next.fileUrl; }
  preloadKey = null;
  setReplayGainDb(next.replayGainDb, to);
  setFade(to, 0);
  active = 1 - active;
  audioEl = to;
  setActiveForAnalyser(to);
  try { to.currentTime = 0; } catch { /* not seekable yet */ }
  useAudioStore.setState((st) => ({
    history: st.currentTrack ? [...st.history, st.currentTrack] : st.history,
    queue: st.queue.slice(1),
    currentTrack: next,
    currentTime: 0,
    duration: 0,
    isPlaying: true,
  }));
  loadTransition(next.albumSlug);
  if (next.replayGainDb === null && next.id > 0) analyzeAndSubmitReplayGain({ id: next.id, fileUrl: next.fileUrl, source: next.source });
  to.play().catch((err) => { console.error("Transition playback failed:", err); useAudioStore.setState({ isPlaying: false }); });
  const ramped = rampFade(to, 1, secs) && rampFade(from, 0, secs);
  finishTimer = setTimeout(() => {
    from.pause(); from.removeAttribute("src"); from.load();
    setFade(from, 1); setFade(to, 1);
    xfading = false;
    arm();
  }, ramped ? secs * 1000 + 120 : 0);
  if (!ramped) { from.pause(); }
}

export const useAudioStore = create<AudioState>((set, get) => ({
  ab: { A: null, B: null, active: null },
  currentTrack: null,
  queue: [],
  history: [],
  shuffle: false,
  repeatMode: "all",
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  expanded: false,
  currentPlaylist: null,

  setCurrentPlaylist: (playlist) => set({ currentPlaylist: playlist }),

  play: (track) => {
    resumeAnalyserContextIfNeeded();
    cancelTransition();
    if (!abInternal) {
      const ab = get().ab;
      const cur = ab.active ? ab[ab.active] : null;
      if (cur && keyOf(cur.track) !== keyOf(track)) set({ ab: { ...ab, active: null } });
    }
    if (track.source === "official") loadTransition(track.albumSlug);
    preloadKey = null;
    const isSameTrack = get().currentTrack?.id === track.id && get().currentTrack?.source === track.source;
    const el = audioEl;
    if (!isSameTrack) {
      set({ currentTrack: track, currentTime: 0, duration: 0 });
      if (el) el.src = track.fileUrl;
      setReplayGainDb(track.replayGainDb);
      if (track.replayGainDb === null && track.id > 0) analyzeAndSubmitReplayGain({ id: track.id, fileUrl: track.fileUrl, source: track.source });
    }
    set({ isPlaying: true });
    el?.play().catch((err) => {
      console.error("Playback failed to start:", err);
      set({ isPlaying: false });
    });
    useAmbienceStore.getState().setEnabled(false);
    arm();
  },

  playAt: (track, startAt) => {
    get().play(track);
    if (!startAt || startAt <= 0) return;
    const el = audioEl;
    set({ currentTime: startAt });
    if (!el) return;
    // Seek once the file knows its length (so a position past its end can be held just inside it); at once if it already does.
    const apply = () => {
      const length = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : Infinity;
      try { el.currentTime = Math.min(startAt, Math.max(0, length - 0.25)); } catch { /* not seekable yet: the loadedmetadata hook below tries again */ }
    };
    if (el.readyState >= 1) apply();
    else el.addEventListener("loadedmetadata", apply, { once: true });
  },

  playQueueIndex: (index) => {
    const { queue, currentTrack, history } = get();
    if (index < 0 || index >= queue.length) return;
    const target = queue[index];
    const passedOver = queue.slice(0, index);
    const rest = queue.slice(index + 1);
    set({
      history: currentTrack ? [...history, ...passedOver, currentTrack] : [...history, ...passedOver],
      queue: rest,
    });
    get().play(target);
  },

  addToQueue: (tracks) => set((s) => ({ queue: [...s.queue, ...(s.shuffle ? shuffleArray(tracks) : tracks)] })),
  clearQueue: () => set({ queue: [] }),

  playNext: () => {
    const { queue, currentTrack, history, repeatMode } = get();
    if (queue.length === 0) {
      // Repeat-all with an empty queue means "start the whole thing over"
      // rather than genuinely stopping.
      if (repeatMode === "all" && (history.length > 0 || currentTrack)) {
        const replay = currentTrack ? [...history, currentTrack] : history;
        const [next, ...rest] = replay;
        set({ history: [], queue: rest });
        if (next) get().play(next);
        return;
      }
      set({ isPlaying: false });
      return;
    }
    const [next, ...rest] = queue;
    set({ history: currentTrack ? [...history, currentTrack] : history, queue: rest });
    get().play(next);
  },

  playPrevious: () => {
    const { history, currentTrack, queue } = get();
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    set({ history: history.slice(0, -1), queue: currentTrack ? [currentTrack, ...queue] : queue });
    get().play(prev);
  },

  // Shuffling reorders what's already queued; turning it off just stops
  // applying it to future additions rather than trying to reconstruct the
  // pre-shuffle order - a reasonable simplification, not full undo.
  toggleShuffle: () =>
    set((s) => (s.shuffle ? { shuffle: false } : { shuffle: true, queue: shuffleArray(s.queue) })),

  cycleRepeat: () =>
    set((s) => ({ repeatMode: s.repeatMode === "off" ? "all" : s.repeatMode === "all" ? "one" : "off" })),
  setRepeatMode: (mode) => set({ repeatMode: mode }),

  toggle: () => {
    if (get().isPlaying) { audioEl?.pause(); if (xfading) otherEl()?.pause(); clearTimeout(boundaryTimer); }
    else audioEl?.play().catch(() => {});
    set((s) => ({ isPlaying: !s.isPlaying }));
    arm();
  },

  seek: (time) => {
    if (xfading) return; // a few seconds of overlap: nothing sensible to seek in
    if (audioEl) audioEl.currentTime = time;
    set({ currentTime: time });
    arm();
  },

  seekBy: (delta) => {
    const { currentTime, duration } = get();
    get().seek(Math.max(0, Math.min(duration || Infinity, currentTime + delta)));
  },

  setExpanded: (expanded) => set({ expanded }),
  setProgress: (currentTime, duration) => {
    set({ currentTime, duration });
    arm();
  },

  abMark: (slot, edge) => {
    const { currentTrack, currentTime, duration, ab } = get();
    if (!currentTrack) return;
    const r = markRange(ab[slot], currentTrack, edge, currentTime, duration || currentTrack.durationSeconds || 0);
    set({ ab: { ...ab, [slot]: { ...r, track: currentTrack } } });
    arm();
  },
  abClear: (slot) => set((s) => ({ ab: { ...s.ab, [slot]: null, active: s.ab.active === slot ? null : s.ab.active } })),
  abPlay: (slot) => {
    const { ab, currentTrack, currentTime } = get();
    const to = ab[slot];
    if (!to) return;
    const from = ab.active ? ab[ab.active] : null;
    const sameAsFrom = !!from && !!currentTrack && keyOf(from.track) === keyOf(currentTrack);
    const pos = flipPosition(sameAsFrom ? from : null, to, currentTime);
    set({ ab: { ...ab, active: slot } });
    abInternal = true;
    try {
      if (currentTrack && keyOf(currentTrack) === keyOf(to.track)) {
        get().seek(pos);
        if (!get().isPlaying) get().toggle();
      } else get().playAt(to.track, pos);
    } finally { abInternal = false; }
    arm();
  },
  abFlip: () => {
    const { ab } = get();
    if (ab.active === "A" && ab.B) get().abPlay("B");
    else if (ab.active === "B" && ab.A) get().abPlay("A");
    else if (ab.A) get().abPlay("A");
    else if (ab.B) get().abPlay("B");
  },
  abStop: () => set((s) => ({ ab: { ...s.ab, active: null } })),

  ended: () => {
    const st = get();
    const e = st.ab.active ? st.ab[st.ab.active] : null;
    if (e && st.currentTrack && keyOf(e.track) === keyOf(st.currentTrack)) {
      get().seek(e.start); // the stretch reached the end of the file: loop it
      audioEl?.play().catch(() => {});
      return;
    }
    if (get().repeatMode === "one") {
      get().seek(0);
      audioEl?.play().catch((err) => console.error("Repeat-one restart failed:", err));
      return;
    }
    get().playNext();
  },
}));
