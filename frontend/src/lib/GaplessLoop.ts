export class GaplessLoop {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private loadedUrl: string | null = null;
  private loadingUrl: string | null = null;

  private ensureContext(): { ctx: AudioContext; gain: GainNode } {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = 0;
      this.gainNode.connect(this.ctx.destination);
    }
    return { ctx: this.ctx, gain: this.gainNode! };
  }

  async play(url: string): Promise<void> {
    const { ctx } = this.ensureContext();
    if (this.loadedUrl !== url) {
      if (this.loadingUrl === url) return; // already fetching this exact URL
      this.loadingUrl = url;
      const res = await fetch(url);
      const arrayBuffer = await res.arrayBuffer();
      this.buffer = await ctx.decodeAudioData(arrayBuffer);
      this.loadedUrl = url;
      this.loadingUrl = null;
    }
    this.stopSource();
    if (!this.buffer || !this.gainNode) return;
    const source = ctx.createBufferSource();
    source.buffer = this.buffer;
    source.loop = true;
    source.connect(this.gainNode);
    source.start();
    this.source = source;
  }

  fadeTo(target: number, durationMs = 400): void {
    if (!this.ctx || !this.gainNode) return;
    const now = this.ctx.currentTime;
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
    this.gainNode.gain.linearRampToValueAtTime(target, now + durationMs / 1000);
    if (target === 0) {
      const s = this.source;
      setTimeout(() => {
        if (s === this.source) this.stopSource();
      }, durationMs + 20);
    }
  }

  private stopSource(): void {
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        // already stopped
      }
      this.source.disconnect();
      this.source = null;
    }
  }

  /** Fully tears down the audio graph — call on unmount so a loop can
   *  never keep sounding after the component that started it is gone. */
  dispose(): void {
    this.stopSource();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.gainNode = null;
    this.buffer = null;
    this.loadedUrl = null;
  }
}
