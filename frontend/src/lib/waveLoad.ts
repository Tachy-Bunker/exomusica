// Getting a track's Morph ball profile: from the server when somebody's browser already worked it out, otherwise by decoding the track here (once, at a low rate to spare memory) and sharing the result.
import { api } from "./api";
import { computeProfile, decodeProfile, encodeProfile, type Profile } from "./waveBall";

export interface WaveTrack { id: number; fileUrl: string; source?: "official" | "community" }
const cache = new Map<string, Profile>(), inflight = new Map<string, Promise<Profile>>();
const keyOf = (t: WaveTrack): string => `${t.source ?? "official"}:${t.id}`;
const endpoint = (t: WaveTrack): string => `/api/${t.source === "community" ? "community-tracks" : "tracks"}/${t.id}/wave-profile`;

async function work(t: WaveTrack, phase: (s: "fetch" | "decode" | "measure") => void): Promise<Profile> {
  phase("fetch");
  const known = await api<{ profile: string | null }>(endpoint(t)).catch(() => null);
  const have = known?.profile ? decodeProfile(known.profile) : null;
  if (have) return have;
  const res = await fetch(t.fileUrl); if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = await res.arrayBuffer();
  phase("decode");
  const ctx = new OfflineAudioContext(1, 1, 22050), buf = await ctx.decodeAudioData(bytes);
  phase("measure");
  await new Promise((r) => setTimeout(r, 0)); // let the "measuring" line paint before the number crunching
  const mono = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) mono[i] += d[i] / buf.numberOfChannels; }
  const p = computeProfile(mono, buf.sampleRate);
  void api(endpoint(t), { method: "POST", body: JSON.stringify({ profile: encodeProfile(p) }) }).catch(() => undefined);
  return p;
}
export function loadProfile(t: WaveTrack, phase: (s: "fetch" | "decode" | "measure") => void = () => undefined): Promise<Profile> {
  const k = keyOf(t), hit = cache.get(k); if (hit) return Promise.resolve(hit);
  let job = inflight.get(k);
  if (!job) { job = work(t, phase).then((p) => { cache.set(k, p); if (cache.size > 12) cache.delete(cache.keys().next().value as string); return p; }).finally(() => inflight.delete(k)); inflight.set(k, job); }
  return job;
}
