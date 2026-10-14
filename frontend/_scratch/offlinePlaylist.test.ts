import assert from "node:assert/strict";
import { filesOf, freeable, playlistTracks } from "../src/lib/offlinePlaylist.js";
const it = (id: number, src: "official" | "community", url: string, cover: string | null, composer: string | null = null) => ({ source: src, trackId: id, title: "T" + id, fileUrl: url, durationSeconds: 60, albumTitle: "A", albumSlug: "a", coverArtUrl: cover, composer, branchSlug: null, replayGainDb: null, genres: [] });
const tr = playlistTracks([it(1, "official", "/uploads/a.wav", "/uploads/c.png"), it(2, "community", "/api/audio-proxy/community-track/2", "/uploads/c.png", "neo"), it(3, "official", "https://far.example/x.mp3", null)], "owner");
assert.equal(tr.length, 3); assert.equal(tr[0].composer, "owner"); assert.equal(tr[1].composer, "neo"); assert.equal(tr[1].source, "community");
assert.deepEqual(filesOf(tr), ["/uploads/c.png", "/uploads/a.wav", "/api/audio-proxy/community-track/2"], "own-site files only, each once");
assert.deepEqual(freeable(["/a", "/b", "/c"], [["/b"], ["/x", "/c"]]), ["/a"], "files another pack still uses stay");
assert.deepEqual(freeable(["/a"], []), ["/a"]);
console.log("offlinePlaylist ok");
