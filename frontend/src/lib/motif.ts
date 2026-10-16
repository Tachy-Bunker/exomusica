/** The collective jingle: a few plucked notes, synthesized on the spot (no audio file is fetched or decoded). A context of its own, closed when the notes are done. */
export const motifLength = (n: number, gap = 0.17): number => n * gap + 0.9;

export function playMotif(notes: readonly number[], volume: number, gap = 0.17): void {
  if (typeof window === "undefined" || notes.length === 0 || !(volume > 0)) return;
  try {
    const ctx = new AudioContext(); void ctx.resume();
    const master = ctx.createGain(); master.gain.value = Math.min(1, volume) * 0.35; master.connect(ctx.destination);
    const t0 = ctx.currentTime + 0.05;
    notes.forEach((f, i) => {
      if (!(f > 20 && f < 5000)) return;
      const t = t0 + i * gap, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.9, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.72);
    });
    window.setTimeout(() => void ctx.close().catch(() => undefined), motifLength(notes.length, gap) * 1000 + 400);
  } catch { /* no audio available: silence */ }
}
