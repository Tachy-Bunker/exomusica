// Which Telemetry panels a visitor pinned to the top. Kept in localStorage; every access tolerates storage being blocked.
export const PANEL_IDS = ["conversations", "members", "messages", "contribute", "cult"] as const;
export type PanelId = (typeof PANEL_IDS)[number];
const KEY = "exomusica_tm_pins";

export function parsePins(raw: string | null): PanelId[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is PanelId => PANEL_IDS.includes(x)).filter((x, i, a) => a.indexOf(x) === i) : [];
  } catch { return []; }
}
export function togglePin(pins: PanelId[], id: PanelId): PanelId[] {
  return pins.includes(id) ? pins.filter((p) => p !== id) : [...pins, id];
}
/** Pinned panels first, in the order they were pinned; the rest keep their normal order. */
export function orderPanels(all: readonly PanelId[], pins: PanelId[]): PanelId[] {
  return [...pins.filter((p) => all.includes(p)), ...all.filter((p) => !pins.includes(p))];
}
export function loadPins(): PanelId[] { try { return parsePins(localStorage.getItem(KEY)); } catch { return []; } }
export function savePins(pins: PanelId[]): void { try { localStorage.setItem(KEY, JSON.stringify(pins)); } catch { /* storage blocked: the pins last for this visit only */ } }
