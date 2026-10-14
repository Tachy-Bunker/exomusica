import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// The backend copy of the room document code must be identical to the frontend's.
assert.equal(readFileSync("src/lib/roomDoc.ts", "utf8"), readFileSync("../frontend/src/lib/roomDoc.ts", "utf8"));
import { cleanDoc } from "../src/lib/roomDoc";
assert.equal(cleanDoc({ actors: [{ id: "a", kind: "solid" }, { id: "b", kind: "nope" }] }).actors.length, 1);
console.log("roomdoc ok");
