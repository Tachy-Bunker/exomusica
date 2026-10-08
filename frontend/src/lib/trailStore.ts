import { create } from "zustand";
import { pushTrail, type TrailEntry } from "./atlas";

// The things you looked at this visit, newest first. Lives for the tab only.
const STORE = "exomusica_trail_v1";
function read(): TrailEntry[] {
  try { const raw = JSON.parse(sessionStorage.getItem(STORE) ?? "[]"); return Array.isArray(raw) ? raw.filter((x) => x && typeof x.id === "string" && typeof x.href === "string").slice(0, 6) : []; } catch { return []; }
}
interface TrailState { trail: TrailEntry[]; visit: (e: TrailEntry) => void }
export const useTrailStore = create<TrailState>((set, get) => ({
  trail: read(),
  visit: (e) => { const trail = pushTrail(get().trail, e); try { sessionStorage.setItem(STORE, JSON.stringify(trail)); } catch { /* fine */ } set({ trail }); },
}));
