import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export interface TrackVersion { id: number; at: number; url: string | null; answers: { id: number; atSeconds: number; body: string; user: string } | null }
export interface TrackVersions { owner: string; revisions: TrackVersion[] }

/** The earlier versions of a community track (nothing for official tracks). */
export function useTrackVersions(trackId: number | null, source: string | undefined): { data: TrackVersions | null; reload: () => void } {
  const [data, setData] = useState<TrackVersions | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    setData(null);
    if (trackId == null || source !== "community") return;
    let live = true;
    api<TrackVersions>(`/api/community-tracks/${trackId}/revisions`).then((d) => { if (live && d && Array.isArray(d.revisions)) setData(d); }).catch(() => undefined);
    return () => { live = false; };
  }, [trackId, source, n]);
  return { data, reload: useCallback(() => setN((x) => x + 1), []) };
}

/** Replaces the track's file; the old one is kept as a version, linked to the comment it answers when given. */
export function uploadNewVersion(trackId: number, file: File, answersCommentId?: number): Promise<unknown> {
  const fd = new FormData();
  fd.append("file", file);
  return api(`/api/community-tracks/${trackId}/replace-file${answersCommentId ? `?answers=${answersCommentId}` : ""}`, { method: "POST", body: fd });
}

export const answeredIds = (d: TrackVersions | null): Set<number> => new Set((d?.revisions ?? []).flatMap((r) => (r.answers ? [r.answers.id] : [])));
