import { create } from "zustand";
import type { MessageDTO } from "./types";

/** Squelch: how much of the room's chatter you want to hear. Client-side only; nothing is deleted, and the count of what's held back is always shown. */
export const LEVELS = ["open", "quiet", "signal", "calls"] as const;
export type Level = 0 | 1 | 2 | 3;
export const LEVEL_NOTE: Record<number, string> = { 0: "Everything", 1: "Hide one-liners", 2: "Signal only: links, sound, calls, replies and mentions of you", 3: "Calls only: CQ, reports, polls, A/B, clips" };

const hasSound = (m: MessageDTO) => m.embeds.length > 0 || m.attachments.length > 0 || /https?:\/\//.test(m.contentRaw);

/** true = hear it. Your own messages and anything addressed to you are never held back. */
export function audible(m: MessageDTO, level: number, me: { id: number; username: string } | null): boolean {
  if (level <= 0 || m.isDeleted) return true;
  if (me && m.authorId === me.id) return true;
  const structured = !!m.kind && m.kind !== "text";
  if (level >= 3) return structured;
  const toMe = !!me && (new RegExp(`@${me.username}\\b`, "i").test(m.contentRaw) || m.replyPreview?.authorUsername === me.username);
  if (structured || toMe) return true;
  if (level === 1) return m.contentRaw.trim().length >= 12 || hasSound(m) || !!m.replyToId;
  return hasSound(m) || !!m.replyToId;
}

const KEY = "exomusica_squelch";
const read = (): Level => { try { const n = Number(localStorage.getItem(KEY)); return (n >= 0 && n <= 3 ? n : 0) as Level; } catch { return 0; } };
export const useSquelchStore = create<{ level: Level; set: (l: Level) => void }>((set) => ({
  level: read(),
  set: (level) => { try { localStorage.setItem(KEY, String(level)); } catch { /* storage blocked */ } set({ level }); },
}));
