import { create } from "zustand";
import { keyOf, hrefOf, type Entity, type EntityType } from "./atlas";

// The pocket: things you picked up to carry between pages. Kept on this device only.
export interface PocketItem { key: string; type: EntityType; id: string; title: string; href: string }
const STORE = "exomusica_pocket_v1";
export const POCKET_MAX = 24;

function read(): PocketItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => x && typeof x.key === "string" && typeof x.href === "string" && typeof x.title === "string").slice(0, POCKET_MAX) : [];
  } catch { return []; }
}
const write = (items: PocketItem[]): void => { try { localStorage.setItem(STORE, JSON.stringify(items)); } catch { /* the pocket still works for this visit */ } };

/** Adds (or moves to the front) an item, keeping at most POCKET_MAX. */
export function addToList(list: PocketItem[], e: Pick<Entity, "type" | "id" | "title">): PocketItem[] {
  const item: PocketItem = { key: keyOf(e.type, e.id), type: e.type, id: e.id.toLowerCase(), title: e.title, href: hrefOf(e.type, e.id) };
  return [item, ...list.filter((x) => x.key !== item.key)].slice(0, POCKET_MAX);
}

interface PocketState {
  items: PocketItem[];
  open: boolean;
  add: (e: Pick<Entity, "type" | "id" | "title">) => void;
  remove: (key: string) => void;
  clear: () => void;
  setOpen: (open: boolean) => void;
}
export const usePocketStore = create<PocketState>((set, get) => ({
  items: read(),
  open: false,
  add: (e) => { const items = addToList(get().items, e); write(items); set({ items }); },
  remove: (key) => { const items = get().items.filter((x) => x.key !== key); write(items); set({ items }); },
  clear: () => { write([]); set({ items: [] }); },
  setOpen: (open) => set({ open }),
}));
