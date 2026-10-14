import assert from "node:assert/strict";
import { adminEdit, memberNotifications, memberProfile, memberVisualEffects, hostedImagePath, cleanLinks } from "../src/lib/profileInput.js";

// members can only write what they should
let r = memberProfile({ bio: "hi", links: [{ label: "a", url: "https://x.y" }], isAdmin: true, passwordHash: "x", username: "root" });
assert.deepEqual(Object.keys(r.data).sort(), ["bio", "links"]); assert.deepEqual(r.bad, []);
assert.deepEqual(memberVisualEffects({ caEnabled: true, isAdmin: true, moireEnabled: "yes" }).data, { caEnabled: true });
assert.deepEqual(memberVisualEffects({ moireEnabled: "yes" }).bad, ["moireEnabled"]);
assert.deepEqual(memberNotifications({ notifyNews: false, isAdmin: true, storageLimitBytes: 1, discordUsername: null }).data, { notifyNews: false, discordUsername: null });
assert.deepEqual(memberProfile({ bio: "x".repeat(1001) }).bad, ["bio"]);
assert.deepEqual(memberProfile({ links: [{ label: "a", url: "javascript:alert(1)" }] }).bad, ["links"]);
assert.deepEqual(memberProfile(null).data, {});
assert.deepEqual(cleanLinks([{ label: "", url: "" }, { label: "ok", url: "http://a.b" }]), [{ label: "ok", url: "http://a.b" }]);
assert.equal(cleanLinks(new Array(11).fill({ label: "a", url: "https://a.b" })), undefined);

// hosted images only
assert.equal(hostedImagePath("/uploads/avatars/a.webp"), "/uploads/avatars/a.webp");
for (const bad of ["https://evil.example/a.png", "//evil.example/a.png", "/uploads/../etc/passwd", "uploads/a.png", "/uploads/a b.png", "/uploads/x?y=1", 5, null]) assert.equal(hostedImagePath(bad), null, String(bad));

// admin edits
const ok = { isGhost: false, self: false };
let a = adminEdit({ username: " new.name ", email: " New@Mail.COM ", bio: "b", storageLimitMb: 750, avatarUrl: "/uploads/avatars/z.png", isAdmin: true, password: "longenough", clearFrame: true, passwordHash: "evil", id: 9 }, ok);
assert.equal(a.data.username, "new.name"); assert.equal(a.data.email, "new@mail.com"); assert.equal(a.data.storageLimitBytes, 750n * 1048576n);
assert.equal(a.password, "longenough"); assert.equal(a.clear.frame, true); assert.equal(a.clear.tint, false);
assert.ok(!("passwordHash" in a.data) && !("id" in a.data), "unknown fields are dropped");
assert.deepEqual(a.bad, []);
a = adminEdit({ username: "no spaces", email: "nope", storageLimitMb: -1, avatarUrl: "https://x/y.png", password: "short" }, ok);
assert.deepEqual(a.bad.sort(), ["avatarUrl", "email", "password", "storageLimitMb", "username"]);
assert.equal(adminEdit({ avatarUrl: null }, ok).data.avatarUrl, null);
assert.equal(adminEdit({ email: "" }, ok).bad[0], "email");
assert.ok(adminEdit({ email: "a@b.co" }, { isGhost: true, self: false }).error);
assert.ok(adminEdit({ password: "longenough" }, { isGhost: true, self: false }).error);
const me = adminEdit({ isAdmin: false, bio: "x" }, { isGhost: false, self: true });
assert.ok(me.error && !("isAdmin" in me.data) && me.data.bio === "x", "can't demote yourself");
assert.equal(adminEdit({ isAdmin: true }, { isGhost: false, self: true }).error, undefined);
assert.deepEqual(adminEdit({ password: "" }, ok).password, undefined);
console.log("profileinput ok");
