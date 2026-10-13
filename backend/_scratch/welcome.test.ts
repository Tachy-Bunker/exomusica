import assert from "node:assert/strict";
import { pickBuddy, welcomeLink, welcomeText } from "../src/lib/welcomeBuddy";
const now = 1_790_000_000_000, d = 86_400_000;
assert.equal(pickBuddy([], now), null);
assert.equal(pickBuddy([{ id: 1, pending: 0, lastActiveAt: now - 90 * d }], now), 1);
assert.equal(pickBuddy([{ id: 1, pending: 0, lastActiveAt: now - 90 * d }, { id: 2, pending: 5, lastActiveAt: now - d }], now), 2); // recent beats idle
assert.equal(pickBuddy([{ id: 1, pending: 2, lastActiveAt: now }, { id: 2, pending: 1, lastActiveAt: now }, { id: 3, pending: 1, lastActiveAt: now }], now, () => 0.9), 3);
assert.equal(pickBuddy([{ id: 1, pending: 2, lastActiveAt: now }, { id: 2, pending: 1, lastActiveAt: now }, { id: 3, pending: 1, lastActiveAt: now }], now, () => 0), 2);
assert.equal(welcomeText("neo"), "Welcome @neo !");
assert.equal(welcomeLink("https://x.org/", "the hall", "neo"), "https://x.org/topic/the%20hall?say=Welcome%20%40neo%20!");
console.log("welcome ok");
