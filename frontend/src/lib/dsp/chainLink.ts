import type { ChainPreset } from "./voiceChain";

/** A chain as it travels in an address: plugin names and raw 0..1 values, nothing else. */
export interface Stage { plugin: string; raw: number[] }
export const MAX_STAGES = 8;
export const MAX_PARAMS = 16;
const NAME = /^[A-Za-z0-9]{1,32}$/;

const b64 = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

/** Values are rounded to 4 decimals: far finer than a slider, and the link stays short. */
export function encodeChain(stages: Stage[]): string {
  const compact = stages.slice(0, MAX_STAGES).map((s) => [s.plugin, s.raw.slice(0, MAX_PARAMS).map((v) => Math.round(Math.min(1, Math.max(0, v)) * 1e4) / 1e4)]);
  return b64(JSON.stringify(compact));
}

/** Null for anything that isn't a well-formed chain (a link is untrusted input). */
export function decodeChain(text: string | null | undefined): Stage[] | null {
  if (!text || text.length > 4000 || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const data: unknown = JSON.parse(unb64(text));
    if (!Array.isArray(data) || data.length === 0 || data.length > MAX_STAGES) return null;
    const out: Stage[] = [];
    for (const item of data) {
      if (!Array.isArray(item) || item.length !== 2) return null;
      const [plugin, raw] = item as [unknown, unknown];
      if (typeof plugin !== "string" || !NAME.test(plugin) || !Array.isArray(raw) || raw.length > MAX_PARAMS) return null;
      if (!raw.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1)) return null;
      out.push({ plugin, raw: raw as number[] });
    }
    return out;
  } catch { return null; }
}

/** The preset the worker runs for a custom chain. */
export function customPreset(stages: Stage[]): ChainPreset {
  return { id: "custom", name: "Custom chain", description: "Built in XenoLab", plugins: stages.map((s) => ({ plugin: s.plugin, role: "", raw: s.raw, shown: [] })) };
}
