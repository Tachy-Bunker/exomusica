import assert from "node:assert/strict";
import { identityProblem } from "../src/lib/branchIdentity";
assert.equal(identityProblem({ reactionEmojiIds: [1, 2, 3] }), null);
assert.equal(identityProblem({}), null);
assert.ok(identityProblem({ reactionEmojiIds: "x" }));
assert.ok(identityProblem({ reactionEmojiIds: [1, 0] }));
assert.ok(identityProblem({ reactionEmojiIds: [1.5] }));
assert.ok(identityProblem({ reactionEmojiIds: Array(25).fill(1) }));
console.log("palette ok");
