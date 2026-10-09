import { synthSpectrogramText, synthXY, type TextOpts, type XYOpts } from "./studioDsp";
export type StudioJob = { id: number; kind: "text"; opts: TextOpts } | { id: number; kind: "xy"; opts: XYOpts };
self.onmessage = (e: MessageEvent<StudioJob>) => {
  const j = e.data;
  const ch = j.kind === "text" ? [synthSpectrogramText(j.opts)] : (() => { const o = synthXY(j.opts); return [o.l, o.r]; })();
  (self as unknown as Worker).postMessage({ id: j.id, channels: ch }, ch.map((c) => c.buffer));
};
