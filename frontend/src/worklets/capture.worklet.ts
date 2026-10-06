// Runs on the audio thread: copies the microphone into mono chunks and sends them straight to the voice note worker
// (over a direct channel, not through the page), so a long recording never has to be held in memory.

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;

const CHUNK = 4096;

class VoiceNoteCapture extends AudioWorkletProcessor {
  private out: MessagePort | null = null;
  private buf = new Float32Array(CHUNK);
  private fill = 0;
  private stopping = false;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<{ type: string; port?: MessagePort }>) => {
      if (e.data.type === "port" && e.data.port) this.out = e.data.port;
      else if (e.data.type === "stop") this.stopping = true;
    };
  }

  private flush() {
    if (this.fill === 0 || !this.out) return;
    const chunk = this.buf.slice(0, this.fill);
    this.out.postMessage({ pcm: chunk, sampleRate }, [chunk.buffer]);
    this.fill = 0;
  }

  process(inputs: Float32Array[][]): boolean {
    const ch = inputs[0];
    if (ch && ch.length > 0 && this.out) {
      const a = ch[0];
      const b = ch.length > 1 ? ch[1] : null;
      for (let i = 0; i < a.length; i++) {
        this.buf[this.fill++] = b ? 0.5 * (a[i] + b[i]) : a[i]; // a stereo microphone is folded to mono here
        if (this.fill === CHUNK) this.flush();
      }
    }
    if (this.stopping) {
      this.flush();
      this.out?.postMessage({ end: true }); // on the same channel as the audio, so it arrives after the last of it
      return false;
    }
    return true;
  }
}

registerProcessor("voice-note-capture", VoiceNoteCapture);
