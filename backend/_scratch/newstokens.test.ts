import assert from "node:assert/strict";
import { fillTokens } from "../src/lib/newsTokens.js";
import { earnedBy, playlistCap, PLAYLIST_BASE, cleanChoice, FRAME_KEYS } from "../src/lib/upgrades.js";

const stats = { totals: { TRACKS: 87, BRANCHTRACKCOUNT: 64, SCANS: 2100, POSTS: 10 }, byBranch: { "baby-crystals": { BRANCHTRACKCOUNT: 7, ALBUMS: 2 } } };
assert.equal(fillTokens("{{BRANCHTRACKCOUNT}} out of 100 !!", stats), "64 out of 100 !!");
assert.equal(fillTokens("{{ tracks }} total", stats), "87 total");
assert.equal(fillTokens("{{BRANCHTRACKCOUNT:baby-crystals}} here", stats), "7 here");
assert.equal(fillTokens("{{TOGO:TRACKS:100}} to go", stats), "13 to go");
assert.equal(fillTokens("{{TOGO:TRACKS:50}} to go", stats), "0 to go");
assert.equal(fillTokens("{{PCT:SCANS:1000}}%", stats), "100%");
assert.equal(fillTokens("{{PCT:TRACKS:200}}%", stats), "43%");
assert.equal(fillTokens("{{NOPE}} {{BRANCHTRACKCOUNT:ghost}} {{TOGO:TRACKS:0}}", stats), "{{NOPE}} {{BRANCHTRACKCOUNT:ghost}} {{TOGO:TRACKS:0}}");
assert.equal(fillTokens("no tokens", stats), "no tokens");
assert.equal(fillTokens("{{TRACKS}}{{TRACKS}}", stats), "8787");

// playlist cap
assert.equal(playlistCap(new Set(), []), PLAYLIST_BASE);
assert.equal(playlistCap(new Set(["crate"]), [{ playlists: 5 }, { playlists: 5 }, {}]), PLAYLIST_BASE + 15);
const keys = (n: number) => new Set(Array.from({ length: n }, (_, i) => `k${i}`));
assert.ok(!earnedBy([], keys(24)).includes("crate"));
assert.ok(earnedBy([], keys(25)).includes("crate"));
// the milestone frame can be worn once reached, not before
assert.ok(FRAME_KEYS.includes("frame-chorus"));
assert.equal(cleanChoice({ frame: "frame-chorus" }, new Set()), null);
assert.deepEqual(cleanChoice({ frame: "frame-chorus" }, new Set(["frame-chorus"])), { frame: "frame-chorus", tint: null });
console.log("newstokens ok");
