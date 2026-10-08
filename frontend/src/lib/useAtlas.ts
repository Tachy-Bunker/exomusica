import { useEffect, useState } from "react";
import { api } from "./api";
import { ENTITY_TYPES, hrefOf, keyOf, type Entity, type EntityType, type Peek } from "./atlas";

// ---- everything that can be jumped to (one small list, fetched once and kept)
let indexPromise: Promise<Entity[]> | null = null;
let indexCache: Entity[] = [];
export function loadIndex(): Promise<Entity[]> {
  indexPromise ??= api<[EntityType, string, string, string][]>("/api/atlas/index")
    .then((rows) => (indexCache = (Array.isArray(rows) ? rows : []).filter((r) => ENTITY_TYPES.includes(r[0])).map(([type, id, title, sub]) => ({ type, id, title, sub: sub || undefined }))))
    .catch(() => { indexPromise = null; return indexCache; });
  return indexPromise;
}
export function useIndex(enabled: boolean): Entity[] {
  const [rows, setRows] = useState<Entity[]>(indexCache);
  useEffect(() => { if (enabled) void loadIndex().then(setRows); }, [enabled]);
  return rows;
}

// ---- what surrounds one thing
export interface ChatRef { slug: string; name: string; branchSlug: string | null; href: string }
export interface Around { key: string; title: string | null; context: Peek[]; conversation: ChatRef[]; neighbors: Peek[] }
type Wire = { type: EntityType; key: string; title: string; href: string; sub?: string; image?: string | null };

const cache = new Map<string, { at: number; data: Around | null }>();
const toPeek = (w: Wire): Peek => ({ type: w.type, id: w.key.slice(w.type.length + 1), key: w.key, title: w.title, sub: w.sub, image: w.image, href: w.href.startsWith("/") ? (w.type === "resource" || w.type === "call" ? hrefOf(w.type, w.key.slice(w.type.length + 1)) : w.href) : "/" });

export function useAround(focus: { type: EntityType; id: string } | null): { around: Around | null; loading: boolean } {
  const key = focus ? keyOf(focus.type, focus.id) : null;
  const [state, setState] = useState<{ key: string | null; around: Around | null; loading: boolean }>({ key: null, around: null, loading: false });
  useEffect(() => {
    if (!key) { setState({ key: null, around: null, loading: false }); return; }
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 60_000) { setState({ key, around: hit.data, loading: false }); return; }
    let alive = true;
    setState({ key, around: null, loading: true });
    api<{ key: string; title: string | null; context: Wire[]; conversation: ChatRef[]; neighbors: Wire[] }>(`/api/atlas/around?key=${encodeURIComponent(key)}`)
      .then((r) => ({ key: r.key, title: r.title, context: (r.context ?? []).map(toPeek), conversation: r.conversation ?? [], neighbors: (r.neighbors ?? []).map(toPeek) }))
      .catch(() => null)
      .then((data) => { cache.set(key, { at: Date.now(), data }); if (alive) setState({ key, around: data, loading: false }); });
    return () => { alive = false; };
  }, [key]);
  // A stale answer for the previous page is never shown for this one.
  return state.key === key ? { around: state.around, loading: state.loading } : { around: null, loading: !!key };
}
