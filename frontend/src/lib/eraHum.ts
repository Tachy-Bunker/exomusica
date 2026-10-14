import { useAudioStore } from "./audioStore";
import { useEra } from "./era";
import { useClassicMode } from "./classicMode";
// A very quiet two-note drone, optional and off by default. Root note per era. It stops while the main player is playing or the tab is hidden, so it never costs anything when something else is going on.
export const HUM_ROOTS = [55, 61.74, 65.41, 73.42, 82.41, 49] as const;
let runningEra = -1;
let ctx: AudioContext | null = null, nodes: { o: OscillatorNode[]; g: GainNode } | null = null;

export function humRoot(era: number): number { return HUM_ROOTS[((era % HUM_ROOTS.length) + HUM_ROOTS.length) % HUM_ROOTS.length]; }

export function startHum(era: number): void {
  if (typeof AudioContext === "undefined") return;
  stopHum();
  try {
    ctx = ctx ?? new AudioContext();
    const g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260;
    g.gain.value = 0; g.connect(lp).connect(ctx.destination);
    const r = humRoot(era), o = [r, r * 1.5, r * 2.003].map((f, i) => { const x = ctx!.createOscillator(); x.type = "sine"; x.frequency.value = f; const v = ctx!.createGain(); v.gain.value = [1, 0.5, 0.25][i]; x.connect(v).connect(g); x.start(); return x; });
    g.gain.linearRampToValueAtTime(0.018, ctx.currentTime + 4);
    nodes = { o, g }; runningEra = era;
    void ctx.resume().catch(() => undefined);
  } catch { /* no audio available */ }
}
export function stopHum(): void {
  if (!nodes || !ctx) { nodes = null; return; }
  const { o, g } = nodes; nodes = null;
  try { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setValueAtTime(g.gain.value, ctx.currentTime); g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6); } catch { /* ignore */ }
  window.setTimeout(() => { for (const x of o) { try { x.stop(); x.disconnect(); } catch { /* already stopped */ } } }, 700);
}
export const humRunning = (): boolean => nodes !== null;

/** Should the hum be sounding right now? Pure, for the rule above. */
export const humWanted = (p: { on: boolean; unlocked: boolean; classic: boolean; playing: boolean; hidden: boolean }): boolean => p.on && p.unlocked && !p.classic && !p.playing && !p.hidden;

export function watchHum(get: () => { on: boolean; unlocked: boolean; classic: boolean; era: number | null }): () => void {
  const update = () => {
    const s = get(), want = humWanted({ ...s, playing: useAudioStore.getState().isPlaying, hidden: document.hidden }) && s.era !== null;
    if (want && (!nodes || runningEra !== s.era)) startHum(s.era!); else if (!want && nodes) stopHum();
  };
  const unsub = useAudioStore.subscribe((st, prev) => { if (st.isPlaying !== prev.isPlaying) update(); });
  const u2 = useEra.subscribe(update), u3 = useClassicMode.subscribe(update);
  document.addEventListener("visibilitychange", update);
  update();
  return () => { unsub(); u2(); u3(); document.removeEventListener("visibilitychange", update); stopHum(); };
}
