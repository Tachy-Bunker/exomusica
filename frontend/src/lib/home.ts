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
  details: string | null; // the longer description, shown when the branch is expanded in Soundbay
  image: string | null; // the main image: shown instead of the emblem
  secondaryImage: string | null; // the background of its tile, and of the module when it is chosen
  albums: number;
  tracks: number;
  chatSlug: string | null;
  lastActiveAt: number | null;
}
export interface HomeActivity {
  kind: "chat" | "album" | "study" | "update" | "challenge" | "member";
  label: string; // what kind of thing it is: read by screen readers (the card shows an icon)
  title: string; // the thing itself: the chat's name, the album, the study...
  by: string | null; // a username, shown in the members' colour and linking to their page
  text: string; // for a chat: what was said
  detail: string; // the dimmed preview line
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

/** One of a branch's pictures (see GET /api/branches/:slug/images). */
export interface BranchPicture { url: string; kind: "branch-cover" | "album-cover" | "gallery"; label: string; albumSlug: string | null }
