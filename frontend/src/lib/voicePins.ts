import { create } from "zustand";

export const fmtClock = (sec: number): string => { const s = Math.max(0, Math.floor(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
/** "@0:07 that low thump" -> { at: 7, text: "that low thump" }. A reply that starts like this is a pin on the voice note it answers. */
export function parsePin(text: string): { at: number; text: string } | null {
  const m = /^@(\d{1,3}):([0-5]\d)(?:\s+([\s\S]*))?$/.exec(text.trim());
  return m ? { at: Number(m[1]) * 60 + Number(m[2]), text: (m[3] ?? "").trim() } : null;
}
export interface Pin { id: number; at: number; by: string; text: string }
/** Pins by the message they answer, from the messages loaded in the room. */
export function pinsByTarget(msgs: { id: number; authorUsername: string; contentRaw: string; isDeleted?: boolean; replyPreview?: { id: number } | null }[]): Record<number, Pin[]> {
  const out: Record<number, Pin[]> = {};
  for (const m of msgs) {
    if (m.isDeleted || !m.replyPreview) continue;
    const p = parsePin(m.contentRaw); if (!p) continue;
    (out[m.replyPreview.id] ??= []).push({ id: m.id, at: p.at, by: m.authorUsername, text: p.text });
  }
  for (const k of Object.keys(out)) out[Number(k)].sort((a, b) => a.at - b.at);
  return out;
}
export const usePinStore = create<{ pins: Record<number, Pin[]>; set: (p: Record<number, Pin[]>) => void }>((set) => ({ pins: {}, set: (pins) => set({ pins }) }));
export const PIN_EVENT = "exomusica:voicepin";
