import { useEffect, useState } from "react";
import { api } from "./api";

export interface HomeBranch {
  slug: string;
  name: string;
  blurb: string;
  coverArtUrl: string | null;
  posX: number;
  posY: number;
  parentSlug: string | null;
  seed: boolean;
  anchor: boolean;
  color: string | null;
  glyph: string | null;
  image: string | null;
  albums: number;
  chatSlug: string | null;
  lastActiveAt: number | null;
}
export interface HomeActivity {
  kind: "chat" | "album" | "study" | "update" | "challenge" | "member";
  label: string;
  title: string;
  detail: string;
  href: string;
  at: number;
}
export interface HomeData {
  stats: { members: number; tracks: number; studies: number; branches: number };
  branches: HomeBranch[];
  activity: HomeActivity[];
  generatedAt: number;
}

// The homepage, Soundbay and Telemetry all show parts of the same data, so moving between them shares ONE request.
let cached: { at: number; promise: Promise<HomeData> } | null = null;
export function loadHome(): Promise<HomeData> {
  if (!cached || Date.now() - cached.at > 20_000) {
    const promise = api<HomeData>("/api/home");
    cached = { at: Date.now(), promise };
    promise.catch(() => { if (cached?.promise === promise) cached = null; });
  }
  return cached.promise;
}

export function useHome(): { home: HomeData | null; failed: boolean } {
  const [home, setHome] = useState<HomeData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    loadHome().then((h) => alive && setHome(h)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, []);
  return { home, failed };
}
