import assert from "node:assert/strict";
import { MILESTONES, resolveMilestones, cleanTarget, MAX_TARGET } from "../src/lib/milestonesCore.js";
import { fillTokens } from "../src/lib/newsTokens.js";

assert.equal(MILESTONES.length, 26);
assert.equal(new Set(MILESTONES.map((m) => m.key)).size, 26, "keys are unique");
assert.ok(MILESTONES.every((m) => m.target >= 1 && m.title && m.perk));
assert.deepEqual(MILESTONES.filter((m) => m.live).map((m) => m.key).sort(), ["m-chart", "m-commons", "m-crateradio", "m-echo", "m-founders", "m-index", "m-jam", "m-jingle", "m-longwave", "m-offline", "m-posts", "m-ring", "m-roll", "m-scans", "m-season", "m-sharedlens", "m-spectral", "m-storm", "m-thermal", "m-tracks", "m-visor", "m-xray"]);

const NOW = new Date("2026-10-14T00:00:00Z");
const by = (list: ReturnType<typeof resolveMilestones>, k: string) => list.find((m) => m.key === k)!;
let r = resolveMilestones(MILESTONES, [], { TRACKS: 99, SCANS: 600 }, NOW);
assert.equal(by(r, "m-tracks").reached, false);
assert.equal(by(r, "m-sharedlens").reached, true);
assert.equal(by(r, "m-sharedlens").reachedAt?.getTime(), NOW.getTime(), "newly reached gets a date");

// admin lowers a target: reached now. Raises it: unreached again, date cleared even if one was stored.
r = resolveMilestones(MILESTONES, [{ key: "m-tracks", target: 50, enabled: true, reachedAt: null }], { TRACKS: 99 }, NOW);
assert.equal(by(r, "m-tracks").reached, true); assert.equal(by(r, "m-tracks").target, 50); assert.equal(by(r, "m-tracks").defaultTarget, 100);
r = resolveMilestones(MILESTONES, [{ key: "m-tracks", target: 500, enabled: true, reachedAt: new Date("2026-01-01") }], { TRACKS: 99 }, NOW);
assert.equal(by(r, "m-tracks").reached, false); assert.equal(by(r, "m-tracks").reachedAt, null);
// a stored date is kept
r = resolveMilestones(MILESTONES, [{ key: "m-tracks", target: null, enabled: true, reachedAt: new Date("2026-01-01") }], { TRACKS: 100 }, NOW);
assert.equal(by(r, "m-tracks").reachedAt?.toISOString(), "2026-01-01T00:00:00.000Z");
// disabled never counts as reached
r = resolveMilestones(MILESTONES, [{ key: "m-tracks", target: null, enabled: false, reachedAt: null }], { TRACKS: 1000 }, NOW);
assert.equal(by(r, "m-tracks").reached, false); assert.equal(by(r, "m-tracks").enabled, false);
// Hull counts the others
r = resolveMilestones(MILESTONES, [], { TRACKS: 1e6, SCANS: 1e6, POSTS: 1e6, MEMBERS: 1e6, STUDIES: 1e6, WIKIPAGES: 1e6, PLAYLISTS: 1e6, BRANCHES: 1e6, COMMUNITYTRACKS: 1e6, COMMUNITYALBUMS: 1e6, MINUTES: 1e6, DAYS: 1e6 }, NOW);
assert.equal(by(r, "m-hull").now, 25); assert.equal(by(r, "m-hull").reached, true);
r = resolveMilestones(MILESTONES, [], {}, NOW);
assert.equal(by(r, "m-hull").now, 0);

// targets validate
assert.equal(cleanTarget(null), null); assert.equal(cleanTarget(250), 250);
for (const bad of [0, -1, 1.5, MAX_TARGET + 1, "10", NaN, undefined]) assert.equal(cleanTarget(bad), undefined, String(bad));

// tokens follow the admin's numbers
const stats = { totals: {}, byBranch: {}, milestones: { "m-tracks": { target: 250, now: 87 } } };
assert.equal(fillTokens("{{MNOW:m-tracks}} out of {{MTARGET:m-tracks}} !! ({{MTOGO:m-tracks}} to go)", stats), "87 out of 250 !! (163 to go)");
assert.equal(fillTokens("{{MTARGET:nope}}", stats), "{{MTARGET:nope}}");
console.log("milestones ok");
