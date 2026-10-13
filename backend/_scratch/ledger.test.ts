import assert from "node:assert/strict";
import { earnedShares } from "../src/lib/ledger";
const r = earnedShares([{ userId: 1, username: "a", points: 30 }, { userId: 2, username: "b", points: 10 }, { userId: 1, username: "a", points: -20 }, { userId: 3, username: null, points: 60 }, { userId: 2, username: "b", points: 0 }]);
assert.deepEqual(r.map((x) => [x.username, x.earned, x.sharePermille]), [["former member", 60, 600], ["a", 30, 300], ["b", 10, 100]]);
assert.deepEqual(earnedShares([]), []); assert.deepEqual(earnedShares([{ userId: 1, username: "a", points: -5 }]), []);
console.log("ledger ok");
