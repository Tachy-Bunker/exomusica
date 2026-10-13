import { useEffect, useMemo, useState } from "react";
import { AirwindowsEngine, type ParamInfo } from "../lib/dsp/airwindows";
import { MAX_STAGES, type Stage } from "../lib/dsp/chainLink";

// The engine (a 350 KB module) is fetched once, and only when someone opens the builder.
let enginePromise: Promise<AirwindowsEngine> | null = null;
const loadEngine = () => (enginePromise ??= fetch("/dsp/airwindows_voice.wasm").then((r) => r.arrayBuffer()).then((b) => AirwindowsEngine.load(b)).catch((e) => { enginePromise = null; throw e; }));

/** A plugin's default values and what it calls and shows each one for a given set of values. */
function describe(engine: AirwindowsEngine, plugin: string, raw?: number[]): { defaults: number[]; info: ParamInfo[] } {
  const inst = engine.create(plugin, 48000);
  try {
    const defaults = Array.from({ length: inst.paramCount }, (_, i) => inst.getParam(i));
    if (raw) raw.forEach((v, i) => i < inst.paramCount && inst.setParam(i, v));
    return { defaults, info: inst.params() };
  } finally { inst.destroy(); }
}

/** Stages of Airwindows plugins in order, each with sliders named and read out by the plugin itself. */
export function ChainBuilder({ stages, onChange, disabled }: { stages: Stage[]; onChange: (s: Stage[]) => void; disabled?: boolean }) {
  const [engine, setEngine] = useState<AirwindowsEngine | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { let live = true; loadEngine().then((e) => live && setEngine(e), () => live && setFailed(true)); return () => { live = false; }; }, []);
  const names = useMemo(() => (engine ? engine.pluginNames().sort() : []), [engine]);
  const key = JSON.stringify(stages);
  const infos = useMemo(() => (engine ? stages.map((s) => { try { return describe(engine, s.plugin, s.raw).info; } catch { return []; } }) : []), [engine, key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return <p className="an-err" role="alert">The effects engine couldn't be loaded.</p>;
  if (!engine) return <p className="home-dim">Loading the effects…</p>;

  const set = (i: number, s: Stage) => onChange(stages.map((x, k) => (k === i ? s : x)));
  const add = () => { const plugin = names[0]; onChange([...stages, { plugin, raw: describe(engine, plugin).defaults }]); };
  const swap = (i: number, plugin: string) => set(i, { plugin, raw: describe(engine, plugin).defaults });
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= stages.length) return; const c = stages.slice(); [c[i], c[j]] = [c[j], c[i]]; onChange(c); };

  return (
    <div className="chain-builder" data-testid="chain-builder">
      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.6rem" }}>
        {stages.map((s, i) => (
          <li key={i} className="chain-stage" data-testid="chain-stage" style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.5rem 0.7rem" }}>
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
              <span className="home-dim">{i + 1}</span>
              <select value={s.plugin} disabled={disabled} onChange={(e) => swap(i, e.target.value)} aria-label={`Effect ${i + 1}`} data-testid="chain-plugin">
                {names.includes(s.plugin) ? null : <option value={s.plugin}>{s.plugin}</option>}
                {names.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <button type="button" className="btn" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label="Move earlier">↑</button>
              <button type="button" className="btn" disabled={disabled || i === stages.length - 1} onClick={() => move(i, 1)} aria-label="Move later">↓</button>
              <button type="button" className="btn" disabled={disabled || stages.length < 2} onClick={() => onChange(stages.filter((_, k) => k !== i))} aria-label="Remove" data-testid="chain-remove">✕</button>
            </div>
            <div style={{ display: "grid", gap: "0.2rem", marginTop: "0.4rem" }}>
              {s.raw.map((v, k) => (
                <label key={k} style={{ display: "grid", gridTemplateColumns: "minmax(5rem,9rem) 1fr minmax(4rem,7rem)", gap: "0.5rem", alignItems: "center", fontSize: "0.85rem" }}>
                  <span className="home-dim">{infos[i]?.[k]?.name || `Param ${k + 1}`}</span>
                  <input type="range" min={0} max={1} step={0.001} value={v} disabled={disabled} onChange={(e) => set(i, { ...s, raw: s.raw.map((x, q) => (q === k ? Number(e.target.value) : x)) })} data-testid="chain-param" />
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{infos[i]?.[k]?.display ?? ""} {infos[i]?.[k]?.label ?? ""}</span>
                </label>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <p><button type="button" className="btn" disabled={disabled || stages.length >= MAX_STAGES} onClick={add} data-testid="chain-add">+ Add an effect</button></p>
    </div>
  );
}
