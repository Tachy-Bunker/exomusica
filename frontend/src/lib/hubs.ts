import { useEffect, useState } from "react";
import { api } from "./api";
import type { ConversationsData, MembersData } from "./spaceHubs";
import type { PostLite, WikiSummary } from "./logTree";

// Same idea as the homepage data: moving between pages inside a short window reuses the request instead of repeating it.
function shared<T>(url: string, ttl = 20_000) {
  let cached: { at: number; promise: Promise<T> } | null = null;
  return () => {
    if (!cached || Date.now() - cached.at > ttl) {
      const promise = api<T>(url);
      cached = { at: Date.now(), promise };
      promise.catch(() => { if (cached?.promise === promise) cached = null; });
    }
    return cached.promise;
  };
}
export const loadConversations = shared<ConversationsData>("/api/conversations");
export const loadMembers = shared<MembersData>("/api/members");

export function useLoaded<T>(load: () => Promise<T>): { data: T | null; failed: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    load().then((d) => alive && setData(d)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [load]);
  return { data, failed };
}
export const loadWikiPages = shared<WikiSummary[]>("/api/wiki");
export const loadPosts = shared<(PostLite & { coverImageUrl: string | null })[]>("/api/blog");
