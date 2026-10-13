import assert from "node:assert/strict";
import { cleanRoles, roleSummary } from "../src/lib/creditRoles";
assert.deepEqual(cleanRoles(["mixing", "mixing", "bogus", 4, "vocals"]), ["mixing", "vocals"]);
assert.deepEqual(cleanRoles("x"), []); assert.deepEqual(cleanRoles(undefined), []);
assert.equal(cleanRoles(["composer", "lyrics", "vocals", "instrument", "field recording", "mixing", "mastering"]).length, 6);
assert.deepEqual(roleSummary([{ roles: [] }, { roles: ["mixing", "composer"] }, { roles: ["mixing"] }]), [{ role: "composer", count: 2 }, { role: "mixing", count: 2 }]);
console.log("creditroles ok");
