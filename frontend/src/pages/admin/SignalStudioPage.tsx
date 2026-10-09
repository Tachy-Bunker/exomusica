import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { FONT_CHARS, MAX_TEXT, encodeWav, gradientTable, spectrogram, synthSpectrogramText, synthXY } from "../../lib/studioDsp";
import { strokePath, thin } from "../../lib/letterDoc";

const RATES = [22050, 32000, 44100, 48000];
interface Made { channels: Float32Array[]; sr: number; bits: 16 | 24 }

/** Runs the synthesis in a worker so the page stays responsive on a weak device; falls back to the page's own thread if workers aren't available. */
function useSynth() {
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);
  useEffect(() => () => worker.current?.terminate(), []);
  return (job: { kind: "text"; opts: Parameters<typeof synthSpectrogramText>[0] } | { kind: "xy"; opts: Parameters<typeof synthXY>[0] }): Promise<Float32Array[]> => {
    const local = () => job.kind === "text" ? [synthSpectrogramText(job.opts)] : (() => { const o = synthXY(job.opts); return [o.l, o.r]; })();
    return new Promise((resolve) => {
      try {
        worker.current ??= new Worker(new URL("../../lib/studio.worker.ts", import.meta.url), { type: "module" });
        const w = worker.current, id = ++seq.current;
        w.onmessage = (e: MessageEvent<{ id: number; channels: Float32Array[] }>) => { if (e.data.id === id) resolve(e.data.channels); };
        w.onerror = () => { worker.current = null; resolve(local()); };
        w.postMessage({ id, ...job });
      } catch { resolve(local()); }
    });
  };
}

function Result({ made, label }: { made: Made; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [up, setUp] = useState<{ url?: string; err?: string; busy?: boolean }>({});
  useEffect(() => {
    const wav = encodeWav(made.channels, made.sr, made.bits);
    const b = new Blob([wav.buffer as ArrayBuffer], { type: "audio/wav" });
    const u = URL.createObjectURL(b); setBlob(b); setUrl(u); setUp({});
    const mono = made.channels.length === 1 ? made.channels[0] : made.channels[0].map((v, i) => (v + made.channels[1][i]) / 2);
    const sp = spectrogram(mono, 1024, 512, 1400), c = canvas.current;
    if (c) {
      c.width = sp.frames; c.height = sp.bins;
      const ctx = c.getContext("2d")!, img = ctx.createImageData(sp.frames, sp.bins), t = gradientTable();
      for (let f = 0; f < sp.frames; f++) for (let k = 0; k < sp.bins; k++) {
        const v = sp.data[f * sp.bins + k], o = ((sp.bins - 1 - k) * sp.frames + f) * 4; // low pitch at the bottom
        img.data[o] = t[v * 3]; img.data[o + 1] = t[v * 3 + 1]; img.data[o + 2] = t[v * 3 + 2]; img.data[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }
    return () => URL.revokeObjectURL(u);
  }, [made]);
  async function upload() {
    if (!blob) return;
    setUp({ busy: true });
    try { const fd = new FormData(); fd.append("file", new File([blob], `${label}.wav`, { type: "audio/wav" })); const r = await api<{ url: string }>("/api/admin/signal/media", { method: "POST", body: fd }); setUp({ url: r.url }); }
    catch (e) { setUp({ err: e instanceof ApiError ? e.message : "Upload failed" }); }
  }
  const secs = made.channels[0].length / made.sr;
  return (
    <div className="studio-result" data-testid="studio-result">
      <canvas ref={canvas} className="studio-spec" aria-label="Spectrogram of the result" data-testid="studio-spec" />
      {url && <audio controls src={url} data-testid="studio-audio" className="sig-media" />}
      <p className="home-dim">{secs.toFixed(1)} s · {made.channels.length === 1 ? "mono" : "stereo"} · {made.bits}-bit · {(made.channels[0].length * made.channels.length * made.bits / 8 / 1048576).toFixed(1)} MB WAV</p>
      <div className="xl-form-row">
        {url && <a className="btn" href={url} download={`${label}.wav`} data-testid="studio-download">Download WAV</a>}
        <button className="btn btn-primary" onClick={() => void upload()} disabled={up.busy} data-testid="studio-upload">{up.busy ? "Uploading…" : "Upload for a transmission"}</button>
      </div>
      {up.url && <p data-testid="studio-url">Put this in the transmission's media field: <code>{up.url}</code></p>}
      {up.err && <p className="an-err" role="alert">{up.err}</p>}
    </div>
  );
}

function DrawPad({ strokes, onChange }: { strokes: number[][]; onChange: (s: number[][]) => void }) {
  const live = useRef<SVGPathElement>(null), box = useRef<HTMLDivElement>(null), pts = useRef<number[]>([]);
  const at = (e: React.PointerEvent) => { const r = box.current!.getBoundingClientRect(); return [Math.round(Math.min(1000, Math.max(0, ((e.clientX - r.left) / r.width) * 1000))), Math.round(Math.min(700, Math.max(0, ((e.clientY - r.top) / r.height) * 700)))]; };
  return (
    <div className="studio-pad" ref={box} data-testid="studio-pad"
      onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture(e.pointerId); pts.current = at(e); live.current?.setAttribute("d", strokePath(pts.current)); }}
      onPointerMove={(e) => { if (!pts.current.length) return; const [x, y] = at(e), p = pts.current; if (Math.abs(x - p[p.length - 2]) + Math.abs(y - p[p.length - 1]) < 4) return; p.push(x, y); live.current?.setAttribute("d", strokePath(p)); }}
      onPointerUp={() => { if (pts.current.length) { onChange([...strokes, thin(pts.current, 400)]); pts.current = []; live.current?.setAttribute("d", ""); } }}>
      <svg viewBox="0 0 1000 700" className="studio-pad-svg" aria-label="Drawing pad">
        <path d="M500 0V700M0 350H1000" className="studio-axis" />
        {strokes.map((s, i) => <path key={i} d={strokePath(s)} className="studio-ink" />)}
        <path ref={live} className="studio-ink" />
      </svg>
    </div>
  );
}

/** Where the puzzle media is made. Spectrogram text and XY-scope drawings are generated here, in the browser, as lossless WAV; nothing is sent anywhere until you upload it. */
export function SignalStudioPage() {
  const synth = useSynth();
  const [tab, setTab] = useState<"text" | "xy">("text");
  const [text, setText] = useState("CQ CQ");
  const [seconds, setSeconds] = useState(8);
  const [fLow, setFLow] = useState(800), [fHigh, setFHigh] = useState(9000);
  const [thick, setThick] = useState(3);
  const [sr, setSr] = useState(44100), [bits, setBits] = useState<16 | 24>(16);
  const [strokes, setStrokes] = useState<number[][]>([]);
  const [rate, setRate] = useState(30);
  const [made, setMade] = useState<(Made & { label: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const lit = useMemo(() => [...text.toUpperCase().slice(0, MAX_TEXT)].filter((c) => FONT_CHARS.includes(c)).length, [text]);
  const hi = Math.min(fHigh, sr / 2 - 200);

  async function generate() {
    setBusy(true);
    const channels = await synth(tab === "text"
      ? { kind: "text", opts: { text, sampleRate: sr, seconds, fLow: Math.min(fLow, hi - 700), fHigh: hi, thickness: thick } }
      : { kind: "xy", opts: { strokes, sampleRate: sr, seconds, rate } });
    setMade({ channels, sr, bits, label: tab === "text" ? "text-" + text.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20) : "xy-scope" });
    setBusy(false);
  }
  const need = tab === "text" ? lit === 0 : strokes.length === 0;
  return (
    <div data-testid="signal-studio" style={{ maxWidth: 900 }}>
      <h1>Signal studio</h1>
      <p className="home-dim">Make the media for a transmission. <Link to="/admin/signal">Back to the graph</Link></p>
      <div className="xl-form-row" role="tablist">
        <button className={`btn${tab === "text" ? " btn-primary" : ""}`} role="tab" aria-selected={tab === "text"} onClick={() => setTab("text")} data-testid="tab-text">Text in the spectrogram</button>
        <button className={`btn${tab === "xy" ? " btn-primary" : ""}`} role="tab" aria-selected={tab === "xy"} onClick={() => setTab("xy")} data-testid="tab-xy">Drawing for an XY scope</button>
      </div>
      <div className="xl-form studio-form">
        {tab === "text" ? (
          <>
            <input value={text} maxLength={MAX_TEXT} onChange={(e) => setText(e.target.value)} placeholder="The words (A-Z, 0-9 and . , ! ? - : / + = ')" aria-label="Text" data-testid="studio-text" />
            <div className="xl-form-row">
              <label>Length <input type="number" min={2} max={60} value={seconds} onChange={(e) => setSeconds(Math.max(2, Math.min(60, Number(e.target.value) || 2)))} style={{ width: "4.5rem" }} aria-label="Seconds" /> s</label>
              <label>From <input type="number" min={100} max={20000} step={100} value={fLow} onChange={(e) => setFLow(Number(e.target.value) || 100)} style={{ width: "5.5rem" }} aria-label="Lowest pitch" /> Hz</label>
              <label>to <input type="number" min={1000} max={22000} step={100} value={fHigh} onChange={(e) => setFHigh(Number(e.target.value) || 1000)} style={{ width: "5.5rem" }} aria-label="Highest pitch" /> Hz</label>
              <label>Bold <input type="range" min={1} max={4} value={thick} onChange={(e) => setThick(Number(e.target.value))} aria-label="Boldness" /></label>
            </div>
            <p className="home-dim">The letters are 5×7 pixels: top of a letter is the highest pitch, time runs left to right. Read it in a spectrogram with a log-free (linear) frequency axis.</p>
          </>
        ) : (
          <>
            <DrawPad strokes={strokes} onChange={setStrokes} />
            <div className="xl-form-row">
              <button className="btn" onClick={() => setStrokes(strokes.slice(0, -1))} disabled={!strokes.length}>Undo</button>
              <button className="btn" onClick={() => setStrokes([])} disabled={!strokes.length}>Clear</button>
              <label>Length <input type="number" min={2} max={60} value={seconds} onChange={(e) => setSeconds(Math.max(2, Math.min(60, Number(e.target.value) || 2)))} style={{ width: "4.5rem" }} aria-label="Seconds" /> s</label>
              <label>Redraws <input type="number" min={10} max={120} value={rate} onChange={(e) => setRate(Math.max(10, Math.min(120, Number(e.target.value) || 30)))} style={{ width: "4.5rem" }} aria-label="Redraws per second" /> /s</label>
            </div>
            <p className="home-dim">Left channel is x, right channel is y. Play it into a scope in XY mode, or an online XY scope. Lines between your strokes are drawn too: a scope has no pen-up.</p>
          </>
        )}
        <div className="xl-form-row">
          <label>Sample rate <select value={sr} onChange={(e) => setSr(Number(e.target.value))} aria-label="Sample rate">{RATES.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
          <label>Depth <select value={bits} onChange={(e) => setBits(Number(e.target.value) as 16 | 24)} aria-label="Bit depth"><option value={16}>16-bit</option><option value={24}>24-bit</option></select></label>
          <button className="btn btn-primary" onClick={() => void generate()} disabled={busy || need} data-testid="studio-go">{busy ? "Making it…" : "Make it"}</button>
        </div>
      </div>
      {made && <Result made={made} label={made.label} />}
    </div>
  );
}
