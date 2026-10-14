import assert from "node:assert/strict";
import { buildAttention, missingForAlbum, missingForBranch, missingForTrack, type AttentionInput } from "../src/lib/attention.js";
const base: AttentionInput = { joinRequests: [], joinTotal: 0, submissions: [], submissionTotal: 0, rewardClaims: [], rewardTotal: 0, newStudies: [], newQuestions: [], newTrashed: 0, branches: [], albums: [], tracks: [], collaborators: [], aboutFeatureCount: 3, faviconUrl: "/f.png" };
assert.deepEqual(buildAttention(base), { panels: {}, total: 0 }, "a complete site shows nothing");
assert.deepEqual(missingForBranch({ description: "  ", coverArtUrl: null }), ["no description", "no cover image"]);
assert.deepEqual(missingForBranch({ description: "x", coverArtUrl: "/c" }), []);
assert.deepEqual(missingForAlbum({ coverArtUrl: null, description: "d", composer: "", trackCount: 0 }), ["no tracks", "no cover", "no composer"]);
assert.deepEqual(missingForTrack({ genres: [], durationSeconds: 0 }), ["no genres", "no duration"]);
const r = buildAttention({ ...base, joinTotal: 3, joinRequests: [{ id: 1, username: "a" }], newTrashed: 2, branches: [{ name: "B", description: null, coverArtUrl: "/c" }, { name: "OK", description: "d", coverArtUrl: "/c" }], aboutFeatureCount: 0, faviconUrl: null,
  tracks: Array.from({ length: 60 }, (_, n) => ({ id: n, title: "t" + n, albumTitle: "A", genres: [], durationSeconds: 5 })) });
assert.equal(r.panels["join-requests"].kind, "todo"); assert.equal(r.panels["join-requests"].count, 3);
assert.equal(r.panels["trash"].kind, "new"); assert.equal(r.panels["branches"].count, 1); assert.equal(r.panels["branches"].items[0].note, "no description");
assert.equal(r.panels["all-tracks"].count, 60); assert.equal(r.panels["all-tracks"].items.length, 40, "the list is capped, the count is not");
assert.ok(r.panels["about"] && r.panels["embeds"]);
assert.equal(r.total, 3 + 2 + 1 + 60 + 1 + 1);
console.log("ok");
